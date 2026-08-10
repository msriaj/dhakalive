import type { RevalidationTargets } from '@dhakalive/core'

/**
 * Edge cache purging.
 *
 * Cloudflare's purge API is the *second* half of invalidation — Next's own
 * route cache is the first. Both are driven from the same target list so the
 * origin and the edge can never disagree about what is stale.
 */

export interface PurgeResult {
  ok: boolean
  /** How many URLs or tags were submitted. */
  submitted: number
  /** Requests actually made, after batching. */
  requests: number
  errors: string[]
}

export interface CachePurger {
  purge(targets: RevalidationTargets): Promise<PurgeResult>
}

export interface CloudflarePurgeConfig {
  zoneId: string
  apiToken: string
  /** Absolute origin the paths belong to, e.g. https://example.com */
  siteUrl: string
  /**
   * Tag-based purge is a Cloudflare Enterprise feature. On every other plan the
   * API rejects `tags`, so the default is to purge the enumerated URLs instead.
   */
  purgeByTag?: boolean
  fetchImpl?: typeof fetch
  /** Cloudflare accepts at most 30 files per purge request. */
  batchSize?: number
  timeoutMs?: number
}

const CLOUDFLARE_MAX_FILES_PER_REQUEST = 30
const DEFAULT_TIMEOUT_MS = 10_000

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size))
  }
  return batches
}

/** A purger that does nothing, used when Cloudflare is not configured. */
export const noopPurger: CachePurger = {
  purge: () => Promise.resolve({ ok: true, submitted: 0, requests: 0, errors: [] }),
}

export function createCloudflarePurger(config: CloudflarePurgeConfig): CachePurger {
  const {
    zoneId,
    apiToken,
    siteUrl,
    purgeByTag = false,
    fetchImpl = fetch,
    batchSize = CLOUDFLARE_MAX_FILES_PER_REQUEST,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = config

  const endpoint = `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`

  async function submit(body: Record<string, unknown>): Promise<string | null> {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      controller.abort()
    }, timeoutMs)

    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!response.ok) {
        // The response body can contain the token; only the status is reported.
        return `Cloudflare purge failed with status ${response.status}`
      }
      return null
    } catch (error) {
      return error instanceof Error
        ? `Cloudflare purge failed: ${error.name}`
        : 'Cloudflare purge failed'
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    async purge(targets: RevalidationTargets): Promise<PurgeResult> {
      if (purgeByTag) {
        if (targets.tags.length === 0) {
          return { ok: true, submitted: 0, requests: 0, errors: [] }
        }
        const error = await submit({ tags: targets.tags })
        return {
          ok: error === null,
          submitted: targets.tags.length,
          requests: 1,
          errors: error ? [error] : [],
        }
      }

      const urls = targets.paths.map((path) => new URL(path, siteUrl).toString())
      if (urls.length === 0) return { ok: true, submitted: 0, requests: 0, errors: [] }

      const batches = chunk(urls, batchSize)
      const results = await Promise.all(batches.map((files) => submit({ files })))
      const errors = results.filter((error): error is string => error !== null)

      return {
        ok: errors.length === 0,
        submitted: urls.length,
        requests: batches.length,
        errors,
      }
    },
  }
}
