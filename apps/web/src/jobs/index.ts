import { can } from '@dhakalive/core'
import type { JobsConfig } from 'payload'

import { toAuthUser } from '../access'
import { jobsCollectionOverrides } from './collection'
import { expireBreaking } from './tasks/expire-breaking'
import { pruneJobs } from './tasks/prune-jobs'
import { publishScheduled } from './tasks/publish-scheduled'
import { revalidate } from './tasks/revalidate'
import { searchIndex } from './tasks/search-index'
import { socialPhotocard } from './tasks/social-photocard'

/**
 * Background jobs.
 *
 * Everything asynchronous the platform does goes through here: search indexing,
 * cache invalidation, scheduled publication, housekeeping. The design decisions
 * worth knowing:
 *
 * - **One runner.** Jobs are executed by the worker container, never by a web
 *   replica. `autoRun` is therefore deliberately absent: it would run jobs
 *   inside whichever Next process happened to boot first, and N replicas would
 *   each publish the same scheduled article. The worker polls explicitly.
 *
 * - **Retries are per task**, sized to what the task talks to — see
 *   `./queues.ts`. A task that exhausts them is dead-lettered: Payload sets
 *   `hasError`, stops retrying, and the row survives in `payload-jobs` with its
 *   full attempt log until someone acts on it.
 *
 * - **Idempotency is a concurrency key**, not a separate ledger. See the comment
 *   on `enqueue`.
 *
 * - **Completed jobs are kept** for a retention window and then swept by
 *   `prune-jobs`, so the table converges to "things that failed".
 */
export function buildJobsConfig(): JobsConfig {
  return {
    tasks: [publishScheduled, expireBreaking, revalidate, searchIndex, socialPhotocard, pruneJobs],

    /**
     * Adds the `concurrencyKey` column that `concurrency` on a task needs. It is
     * a schema change, which is why it is switched on here once rather than
     * arriving with whichever task first wants it.
     */
    enableConcurrencyControl: true,

    /** Records which job queued a task, so a failure can be traced upstream. */
    addParentToTaskLog: true,

    /**
     * Kept, not deleted. A completed job is the record that the CDN was purged
     * or the article was indexed, and that is worth having for the window in
     * which anyone would ask. `prune-jobs` bounds the growth.
     */
    deleteJobOnComplete: false,

    /**
     * The HTTP job endpoints are administrative. Local API calls from the worker
     * pass `overrideAccess` and are unaffected; this closes
     * `/api/payload-jobs/run` to an authenticated editor, for whom triggering
     * the queue by hand has no legitimate use.
     */
    access: {
      run: ({ req }) => can(toAuthUser(req.user), 'globals:manage.system'),
      queue: ({ req }) => can(toAuthUser(req.user), 'globals:manage.system'),
      cancel: ({ req }) => can(toAuthUser(req.user), 'globals:manage.system'),
    },

    jobsCollectionOverrides,
  }
}

export { enqueue } from './enqueue'
export { QUEUE } from './queues'
export type { QueueName } from './queues'
export type { TaskInputs, TaskName } from './types'
