import { CORRELATION_HEADER } from '@dhakalive/observability'
import type { TaskConfig } from 'payload'

import { env } from '../../lib/env'
import { RETRY_REMOTE } from '../queues'
import { correlationIdField, correlationOf, logFailure, taskLogger } from '../telemetry'
import type { RevalidateInput } from '../types'

/**
 * Clears the caches affected by a change that happened outside a request.
 *
 * This closes a real hole. `revalidatePath` only works inside a Next request
 * scope, so when the worker published a scheduled article the call threw, the
 * error was swallowed, and the origin kept serving the old page until its
 * `revalidate` window expired. The CDN purge ran, which made it worse: the edge
 * refetched from an origin that was still stale and cached that.
 *
 * The worker is not a Next process and cannot be made into one, so it asks the
 * web app instead — an authenticated POST to `/api/revalidate`, which runs
 * `revalidatePath` where it works and purges the CDN from there.
 *
 * What travels is the *event*, never a list of paths. The endpoint recomputes
 * targets with the same pure function every in-process caller uses, so this job
 * cannot invent a purge set that a real edit would not have produced.
 */

const REQUEST_TIMEOUT_MS = 10_000

interface RevalidateOutput {
  paths: number
  purged: boolean
  [k: string]: unknown
}

export const revalidate: TaskConfig<{ input: RevalidateInput; output: RevalidateOutput }> = {
  slug: 'revalidate',
  label: 'Revalidate caches for a content change',
  retries: RETRY_REMOTE,

  inputSchema: [
    correlationIdField,
    {
      name: 'event',
      type: 'json',
      required: true,
      admin: { description: 'The content change, as `RevalidationEvent`.' },
    },
  ],

  outputSchema: [
    { name: 'paths', type: 'number' },
    { name: 'purged', type: 'checkbox' },
  ],

  /**
   * No concurrency key.
   *
   * Superseding would be wrong here even though these jobs look repetitive:
   * two changes to the same article can have *different* target sets — a slug
   * change purges the old URL, and dropping the earlier job would leave that
   * URL cached forever. Purges are idempotent and cheap, so running both is the
   * cheaper mistake.
   */

  onFail: logFailure('revalidate', RETRY_REMOTE.attempts ?? 0),

  handler: async ({ input }) => {
    const correlationId = correlationOf(input)
    const logger = taskLogger('revalidate', input)
    const serverEnv = env()

    const endpoint = new URL('/api/revalidate', serverEnv.NEXT_PUBLIC_SITE_URL)

    /**
     * A hung origin must not hold a runner slot open. The abort is what turns a
     * stuck request into a retry rather than a stalled queue.
     */
    const abort = AbortSignal.timeout(REQUEST_TIMEOUT_MS)

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-revalidation-secret': serverEnv.REVALIDATION_SECRET,
        [CORRELATION_HEADER]: correlationId,
      },
      body: JSON.stringify(input.event),
      signal: abort,
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      /**
       * Thrown, not logged and swallowed: this is the retry path, and a 502 from
       * a restarting web replica is exactly the case retries exist for. A 400
       * will exhaust its attempts and dead-letter, which is the correct outcome
       * for an event this endpoint refuses to accept.
       */
      throw new Error(`Revalidation endpoint returned ${response.status}: ${detail.slice(0, 200)}`)
    }

    const result = (await response.json()) as { paths?: unknown; purged?: unknown }
    const paths = typeof result.paths === 'number' ? result.paths : 0

    logger.info({ paths, purged: result.purged === true }, 'Revalidated out-of-request change')

    return { output: { paths, purged: result.purged === true } }
  },
}
