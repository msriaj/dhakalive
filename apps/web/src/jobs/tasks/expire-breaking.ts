import { DEFAULT_LOCALE } from '@dhakalive/config'
import type { TaskConfig } from 'payload'

import { RETRY_SWEEP } from '../queues'
import { correlationIdField, logFailure, taskLogger } from '../telemetry'
import type { ExpireBreakingInput } from '../types'

/**
 * Clears the breaking flag once `breakingUntil` has passed.
 *
 * The alternative — filtering on `breakingUntil > now` at read time — was
 * rejected. The ticker is rendered on every cached page, so a flag that expires
 * by query result changes the page without any write to invalidate the cache,
 * and yesterday's emergency stays in the masthead until something unrelated
 * happens to purge it. Clearing the field is a write, and a write revalidates.
 *
 * Deliberately not a status change: an expired breaking story is still a
 * published story, it simply stops being urgent.
 */

const MAX_PER_RUN = 50

interface ExpireBreakingOutput {
  cleared: number
  [k: string]: unknown
}

export const expireBreaking: TaskConfig<{
  input: ExpireBreakingInput
  output: ExpireBreakingOutput
}> = {
  slug: 'expire-breaking',
  label: 'Clear expired breaking-news flags',
  retries: RETRY_SWEEP,

  inputSchema: [correlationIdField],
  outputSchema: [{ name: 'cleared', type: 'number' }],

  /**
   * `exclusive` without `supersedes`.
   *
   * `supersedes` deletes pending jobs sharing this key when a new one is queued,
   * which is right for event-driven work and catastrophic for a cron sweep: the
   * scheduler queues each run with `waitUntil` set to the next cron time, so
   * every tick would delete the job that was waiting and replace it with one
   * waiting slightly longer. The sweep would be perpetually rescheduled and
   * never actually run.
   */
  concurrency: { key: () => 'expire-breaking', exclusive: true },

  onFail: logFailure('expire-breaking', RETRY_SWEEP.attempts ?? 0),

  handler: async ({ input, req }) => {
    const logger = taskLogger('expire-breaking', input)
    const now = new Date().toISOString()

    const expired = await req.payload.find({
      collection: 'articles',
      where: {
        and: [
          { isBreaking: { equals: true } },
          { breakingUntil: { less_than_equal: now } },
          // An article with no expiry stays breaking until an editor says
          // otherwise; only an explicitly set deadline is enforced.
          { breakingUntil: { exists: true } },
        ],
      },
      // No `draft: true` — see the note in `publish-scheduled`.
      overrideAccess: true,
      depth: 0,
      limit: MAX_PER_RUN,
      pagination: false,
      req,
    })

    if (expired.docs.length === 0) return { output: { cleared: 0 } }

    let cleared = 0

    for (const article of expired.docs) {
      try {
        await req.payload.update({
          collection: 'articles',
          id: article.id,
          data: { isBreaking: false },
          locale: DEFAULT_LOCALE,
          overrideAccess: true,
          req,
        })
        cleared += 1
      } catch (error) {
        logger.error({ err: error, articleId: article.id }, 'Could not clear the breaking flag')
      }
    }

    logger.info({ cleared }, 'Cleared expired breaking flags')
    return { output: { cleared } }
  },
}
