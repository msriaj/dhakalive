import 'server-only'

import { MAX_REDIRECT_HOPS, normaliseRedirectPath } from '@dhakalive/core'
import { getLogger } from '@dhakalive/observability'
import { permanentRedirect, redirect } from 'next/navigation'

import { getPayloadClient } from './queries/client'

/**
 * Resolving a request that would otherwise 404.
 *
 * Deliberately not middleware. Middleware runs on every request including the
 * ones that resolve perfectly well, and a database lookup there would be paid
 * by every reader to serve the small minority following a stale link. Called at
 * the point a route is about to give up, the cost lands only on requests that
 * were going to fail anyway.
 *
 * The trade is that each route has to call it before `notFound()`. That is a
 * handful of call sites, all of which already know they are about to 404.
 */

interface RedirectRow {
  to: string
  permanence?: string | null
  isActive?: boolean | null
}

async function lookup(path: string): Promise<RedirectRow | null> {
  const payload = await getPayloadClient()

  const result = await payload.find({
    collection: 'redirects',
    where: { and: [{ from: { equals: path } }, { isActive: { not_equals: false } }] },
    limit: 1,
    depth: 0,
    overrideAccess: false,
  })

  return result.docs[0] ?? null
}

/**
 * Follows the chain and performs the redirect, or returns so the caller can
 * 404.
 *
 * Never returns a value when it matches — `redirect()` throws, which is how
 * Next unwinds to the response. A caller writes:
 *
 *     await redirectIfKnown(path)
 *     notFound()
 */
export async function redirectIfKnown(path: string): Promise<void> {
  const start = normaliseRedirectPath(path)
  if (!start) return

  const visited = new Set<string>([start])
  let current = start
  let permanence = 'permanent'
  let hops = 0

  for (;;) {
    const row = await lookup(current)
    // No further hop: whatever we have walked to is the destination.
    if (!row) break

    hops += 1
    permanence = row.permanence ?? 'permanent'

    /**
     * An external destination ends the chain. The target is not ours to look
     * up, and following it further would mean walking somebody else's redirect
     * table.
     */
    if (!row.to.startsWith('/')) performRedirect(row.to, permanence)

    const next = normaliseRedirectPath(row.to)
    if (!next) break

    if (visited.has(next)) {
      /**
       * A cycle. The collection refuses to create one, so reaching here means
       * the table was written around that check — directly in the database, or
       * by two entries created concurrently. Falling through to a 404 is the
       * safe end; following it hands the reader ERR_TOO_MANY_REDIRECTS.
       */
      getLogger().error({ path: start, at: next }, 'Redirect loop detected — refusing to follow')
      return
    }

    if (hops > MAX_REDIRECT_HOPS) {
      // Send them to where the chain had reached rather than 404-ing: it is
      // almost certainly closer to right than the URL they asked for.
      getLogger().warn({ path: start, stoppedAt: next }, 'Redirect chain exceeded its hop limit')
      performRedirect(next, permanence)
    }

    visited.add(next)
    current = next
  }

  if (current !== start) performRedirect(current, permanence)
}

function performRedirect(target: string, permanence: string): never {
  /**
   * A permanent redirect is cached by browsers indefinitely, which is what
   * makes it right for a moved story and unforgiving for a temporary one — a
   * mistake here cannot be taken back from a reader's cache. Next models the
   * distinction as two functions rather than a status argument.
   */
  if (permanence === 'permanent') permanentRedirect(target)
  redirect(target)
}
