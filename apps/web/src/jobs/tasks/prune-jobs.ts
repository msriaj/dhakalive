import type { TaskConfig } from 'payload'

import { QUEUE, RETRY_SWEEP } from '../queues'
import { correlationIdField, logFailure, taskLogger } from '../telemetry'
import type { PruneJobsInput } from '../types'

/**
 * Deletes completed jobs, and only completed jobs.
 *
 * Without this the jobs table grows without bound: a newsroom publishing a few
 * hundred stories a day queues several thousand indexing and revalidation jobs a
 * week, all of them uninteresting the moment they succeed.
 *
 * Failures are never pruned. A row with `hasError` is the dead-letter record —
 * it holds the error and every attempt — and it stays until a person looks at
 * it. A retention sweep that quietly deleted failures would turn a permanent
 * failure into an invisible one.
 */

const DEFAULT_RETENTION_DAYS = 7
const MAX_PER_RUN = 500

interface PruneJobsOutput {
  deleted: number
  [k: string]: unknown
}

export const pruneJobs: TaskConfig<{ input: PruneJobsInput; output: PruneJobsOutput }> = {
  slug: 'prune-jobs',
  label: 'Prune completed jobs',
  retries: RETRY_SWEEP,

  inputSchema: [
    correlationIdField,
    {
      name: 'olderThanDays',
      type: 'number',
      admin: {
        description: `Retention window for completed jobs. Defaults to ${DEFAULT_RETENTION_DAYS}.`,
      },
    },
  ],

  outputSchema: [{ name: 'deleted', type: 'number' }],

  /**
   * One sweep at a time, and a newly queued sweep replaces a pending one. Two
   * concurrent sweeps would race on the same rows for no benefit.
   */
  concurrency: { key: () => 'prune-jobs', exclusive: true, supersedes: true },

  schedule: [{ cron: '0 4 * * *', queue: QUEUE.maintenance }],

  onFail: logFailure('prune-jobs', RETRY_SWEEP.attempts ?? 0),

  handler: async ({ input, req }) => {
    const days = input.olderThanDays ?? DEFAULT_RETENTION_DAYS
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const logger = taskLogger('prune-jobs', input, { retentionDays: days })

    /**
     * `completedAt` is set only on success, so this can never match a job that
     * is still retrying — and `hasError` is checked as well rather than relying
     * on that alone.
     */
    const stale = await req.payload.find({
      collection: 'payload-jobs',
      where: {
        and: [
          { completedAt: { less_than: cutoff.toISOString() } },
          { hasError: { not_equals: true } },
        ],
      },
      limit: MAX_PER_RUN,
      depth: 0,
      pagination: false,
      overrideAccess: true,
      req,
    })

    if (stale.docs.length === 0) {
      logger.debug('No completed jobs to prune')
      return { output: { deleted: 0 } }
    }

    await req.payload.delete({
      collection: 'payload-jobs',
      where: { id: { in: stale.docs.map((job) => job.id) } },
      depth: 0,
      overrideAccess: true,
      req,
    })

    /**
     * Capped per run so one sweep cannot hold a long transaction over a backlog.
     * The next scheduled run continues; the cap is logged so a table that is
     * growing faster than it drains is visible rather than silently truncated.
     */
    if (stale.docs.length === MAX_PER_RUN) {
      logger.warn(
        { deleted: stale.docs.length },
        'Prune hit its per-run cap — more completed jobs remain',
      )
    } else {
      logger.info({ deleted: stale.docs.length }, 'Pruned completed jobs')
    }

    return { output: { deleted: stale.docs.length } }
  },
}
