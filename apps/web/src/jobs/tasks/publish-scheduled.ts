import { DEFAULT_LOCALE } from '@dhakalive/config'
import type { TaskConfig } from 'payload'

import { RETRY_SWEEP } from '../queues'
import { correlationIdField, logFailure, taskLogger } from '../telemetry'
import type { PublishScheduledInput } from '../types'

/**
 * Publishes articles whose scheduled time has arrived.
 *
 * `scheduledAt` has been validated and stored since Phase 3 with nothing acting
 * on it; this is what acts on it.
 *
 * ## Why the worker, and only the worker
 *
 * Exactly one process may do this. N web replicas polling the same query would
 * each publish the same article, and each publication fans out into cache
 * purges, index writes and — later — feeds and push notifications. The job
 * system's concurrency key adds a second guarantee on top of the single-runner
 * deployment, so even a misconfigured second worker cannot double-publish.
 *
 * ## The transition is real
 *
 * There is no direct write of `workflowStatus`. The update goes through the same
 * `beforeChange` hook an editor's request does, and the transition table has an
 * explicit `systemOnly` row for `scheduled → published` that only a caller
 * setting `req.context.isSystemTransition` can take. That context flag is not
 * reachable from an HTTP body. Consequences: the publish guards still run, so a
 * story that lost its featured image between scheduling and publication is
 * refused rather than published broken, and the transition is recorded in
 * `workflowHistory` like any other.
 */

/** Articles published per run. A backlog drains over consecutive runs. */
const MAX_PER_RUN = 25

interface PublishScheduledOutput {
  published: number
  failed: number
  [k: string]: unknown
}

export const publishScheduled: TaskConfig<{
  input: PublishScheduledInput
  output: PublishScheduledOutput
}> = {
  slug: 'publish-scheduled',
  label: 'Publish scheduled articles',
  retries: RETRY_SWEEP,

  inputSchema: [correlationIdField],

  outputSchema: [
    { name: 'published', type: 'number' },
    { name: 'failed', type: 'number' },
  ],

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
  concurrency: { key: () => 'publish-scheduled', exclusive: true },

  onFail: logFailure('publish-scheduled', RETRY_SWEEP.attempts ?? 0),

  handler: async ({ input, req }) => {
    const logger = taskLogger('publish-scheduled', input)
    const now = new Date().toISOString()

    const due = await req.payload.find({
      collection: 'articles',
      where: {
        and: [
          { workflowStatus: { equals: 'scheduled' } },
          { scheduledAt: { less_than_equal: now } },
        ],
      },
      /**
       * No `draft: true`. The editorial status lives on the main row — the
       * workflow hook writes it there on every save — and Payload does not
       * filter that row by `_status` unless drafts are explicitly requested.
       * Asking for drafts pivots the query onto the versions table, where a
       * `where` on `workflowStatus` and `scheduledAt` matches nothing: the
       * sweep would find no due articles and publish nothing, silently.
       */
      overrideAccess: true,
      depth: 0,
      limit: MAX_PER_RUN,
      sort: 'scheduledAt',
      pagination: false,
      req,
    })

    if (due.docs.length === 0) return { output: { published: 0, failed: 0 } }

    let published = 0
    let failed = 0

    for (const article of due.docs) {
      try {
        await req.payload.update({
          collection: 'articles',
          id: article.id,
          data: {
            workflowStatus: 'published',
            /**
             * The story is stamped with the time it was *meant* to appear, not
             * the moment the sweep happened to reach it. A newsroom scheduling
             * something for 09:00 means 09:00, and a timestamp that drifts with
             * runner latency would make ordering depend on infrastructure.
             */
            publishedAt: article.publishedAt ?? article.scheduledAt ?? now,
          },
          locale: DEFAULT_LOCALE,
          // No user: this is the scheduler. The transition below is the only
          // one in the table that can be taken without one.
          overrideAccess: true,
          context: { isSystemTransition: true },
          req,
        })

        published += 1
        logger.info({ articleId: article.id }, 'Published scheduled article')
      } catch (error) {
        /**
         * One article failing must not hold up the rest — a story blocked by a
         * publish guard would otherwise block every story scheduled behind it.
         * The article stays `scheduled` and the next run retries; the log is
         * what tells an editor their story did not go out.
         */
        failed += 1
        logger.error(
          { err: error, articleId: article.id, scheduledAt: article.scheduledAt },
          'Scheduled article could not be published',
        )
      }
    }

    if (due.docs.length === MAX_PER_RUN) {
      logger.warn({ published, failed }, 'Scheduled publication hit its per-run cap')
    }

    return { output: { published, failed } }
  },
}
