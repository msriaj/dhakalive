import { getLogger } from '@dhakalive/observability'
import type { Payload, PayloadRequest } from 'payload'

import type { QueueName } from './queues'
import { correlationOf } from './telemetry'
import type { TaskInputs, TaskName } from './types'

/**
 * Queues a task.
 *
 * ## Idempotency
 *
 * There is no separate idempotency-key table. Each task declares a
 * `concurrency.key` derived from its input — `search-index:article:412` — and
 * the job system enforces two things against it: `exclusive` means only one job
 * with that key runs at a time, and `supersedes` means queueing a new one drops
 * any earlier job with the same key that has not started yet. An editor saving
 * five times in a minute therefore produces one index job, not five, and the key
 * is an indexed column rather than a lookup we perform ourselves.
 *
 * That collapses duplicates; it does not *guarantee* exactly-once, and nothing
 * can — a job can always fail after its side effect and be retried. So every
 * handler is written to be idempotent in its own right (upsert, delete-if-
 * present, publish-if-still-scheduled). The concurrency key is the optimisation;
 * the handler is the guarantee.
 *
 * ## Failure
 *
 * Never throws. Queueing happens inside `afterChange` hooks, and an editor's
 * save must not fail because the jobs table was briefly unreachable. A dropped
 * enqueue is a stale index or a stale cache entry, both of which are bounded by
 * the route's own revalidation window; a failed save loses the story.
 */
export async function enqueue<T extends TaskName>(args: {
  payload: Payload
  task: T
  input: TaskInputs[T]
  queue: QueueName
  /** Passed through so the job is created in the caller's transaction. */
  req?: PayloadRequest
  /** Earliest time the job may run. Used by scheduled publication. */
  waitUntil?: Date
}): Promise<boolean> {
  const { payload, task, input, queue, req, waitUntil } = args

  /**
   * The caller's id wins; otherwise inherit the one on the request context, so
   * a job queued from a hook stays joined to the HTTP request that triggered it.
   * `correlationOf` mints a fresh id when neither carries one.
   */
  const correlationId = input.correlationId ? correlationOf(input) : correlationOf(req?.context)
  const logger = getLogger()

  try {
    await payload.jobs.queue({
      // The queue API is typed against Payload's generated `TypedJobs`, which is
      // produced from this config. `TaskInputs` above is the authority for these
      // call sites; this cast is where the two meet.
      task: task as never,
      input: { ...input, correlationId } as never,
      queue,
      ...(waitUntil ? { waitUntil } : {}),
      ...(req ? { req } : {}),
    })

    logger.debug({ correlationId, task, queue }, 'Job queued')
    return true
  } catch (error) {
    logger.error({ correlationId, task, queue, err: error }, 'Failed to queue job')
    return false
  }
}
