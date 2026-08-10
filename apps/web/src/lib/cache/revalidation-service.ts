import 'server-only'

import { revalidatePath } from 'next/cache'

import { LOCALES } from '@dhakalive/config'
import { createCloudflarePurger, noopPurger, type CachePurger } from '@dhakalive/cache'
import {
  CacheTag,
  computeRevalidationTargets,
  mergeTargets,
  type RevalidationEvent,
  type RevalidationTargets,
} from '@dhakalive/core'
import { getLogger } from '@dhakalive/observability'

import { env } from '../env'

/**
 * The one place cache invalidation happens.
 *
 * Collection hooks do not call `revalidatePath` or Cloudflare directly; they
 * describe *what changed* and this decides what that means. Scattering purge
 * calls through hooks is how a system ends up with three different ideas of
 * which pages a published article affects.
 *
 * Two layers are invalidated from the same target list:
 *   1. Next's route cache, via `revalidatePath`.
 *   2. Cloudflare's edge cache, via the purge API.
 *
 * Next is invalidated by *path*, not by tag. Tags would be the better tool, but
 * they only attach to `fetch`-based caching, and every query here goes through
 * Payload's Local API. Paths are enumerated exactly by `computeRevalidationTargets`,
 * so nothing is lost — except for site-wide layout changes, which no path list
 * can express and which are handled by a layout-scoped revalidation below.
 */

let purger: CachePurger | undefined

function getPurger(): CachePurger {
  if (purger) return purger

  const serverEnv = env()
  purger =
    serverEnv.CLOUDFLARE_ZONE_ID && serverEnv.CLOUDFLARE_API_TOKEN
      ? createCloudflarePurger({
          zoneId: serverEnv.CLOUDFLARE_ZONE_ID,
          apiToken: serverEnv.CLOUDFLARE_API_TOKEN,
          siteUrl: serverEnv.NEXT_PUBLIC_SITE_URL,
          purgeByTag: serverEnv.CLOUDFLARE_PURGE_BY_TAG,
        })
      : noopPurger

  return purger
}

/** Test seam; also lets the worker inject its own client later. */
export function setPurger(next: CachePurger | undefined): void {
  purger = next
}

function revalidateNextPaths(targets: RevalidationTargets): { paths: number; layouts: number } {
  let layouts = 0

  /**
   * A layout tag means the shared chrome changed — header, footer, site
   * settings. That affects every page under the locale layout, which is not
   * expressible as a path list, so the layout itself is revalidated instead.
   */
  for (const locale of LOCALES) {
    if (!targets.tags.includes(CacheTag.layout(locale))) continue
    revalidatePath(`/${locale}`, 'layout')
    layouts += 1
  }

  for (const path of targets.paths) {
    revalidatePath(path)
  }

  return { paths: targets.paths.length, layouts }
}

export interface RevalidationOutcome {
  targets: RevalidationTargets
  purged: boolean
  errors: string[]
}

/**
 * Invalidates everything affected by one or more content changes.
 *
 * Never throws. A cache that fails to clear is a stale page; an exception here
 * would fail the editor's save, which is strictly worse — the content would not
 * be published at all.
 */
export async function revalidateFor(...events: RevalidationEvent[]): Promise<RevalidationOutcome> {
  const targets = mergeTargets(...events.map(computeRevalidationTargets))
  const logger = getLogger()
  const errors: string[] = []

  if (targets.paths.length === 0 && targets.tags.length === 0) {
    return { targets, purged: false, errors }
  }

  try {
    const counts = revalidateNextPaths(targets)
    logger.debug({ ...counts }, 'Revalidated Next route cache')
  } catch (error) {
    // `revalidatePath` throws outside a request scope — for instance when the
    // worker publishes a scheduled article. The CDN purge below still runs, and
    // the route's own `revalidate` window bounds the staleness.
    errors.push(error instanceof Error ? error.message : 'Route cache revalidation failed')
  }

  const result = await getPurger().purge(targets)
  if (!result.ok) {
    errors.push(...result.errors)
    logger.error({ errors: result.errors, submitted: result.submitted }, 'CDN purge failed')
  }

  return { targets, purged: result.submitted > 0, errors }
}
