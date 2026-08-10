import type { TaskConfig } from 'payload'

/**
 * Queue names and retry policies.
 *
 * Queues exist to keep unrelated failure modes apart. A Cloudflare outage
 * filling the `content` queue with retrying purge jobs must not delay scheduled
 * publication, and a long maintenance sweep must not sit in front of an
 * editor's search re-index.
 */
export const QUEUE = {
  /** Reacting to a content change: search indexing, cache invalidation. */
  content: 'content',
  /** Clock-driven work: scheduled publication, flag expiry. */
  scheduled: 'scheduled',
  /** Housekeeping that nobody is waiting on. */
  maintenance: 'maintenance',
} as const

export type QueueName = (typeof QUEUE)[keyof typeof QUEUE]

/**
 * `RetryConfig` is not exported from Payload's root entry point, so it is
 * recovered from the task config type rather than reached for through a deep
 * import into `dist`.
 */
type RetryPolicy = Extract<
  NonNullable<TaskConfig<{ input: object; output: object }>['retries']>,
  object
>

/**
 * Work whose target is a third party that may be briefly unavailable — the
 * Cloudflare purge API, a search cluster.
 *
 * Exponential from two seconds: the fourth attempt lands ~14s after the first,
 * which covers a redeploy or a transient 5xx without holding a runner slot for
 * minutes.
 */
export const RETRY_REMOTE: RetryPolicy = {
  attempts: 4,
  backoff: { type: 'exponential', delay: 2_000 },
}

/**
 * Work against our own database, where a failure is usually a lock or a
 * connection blip. Fewer attempts, tighter spacing.
 */
export const RETRY_LOCAL: RetryPolicy = {
  attempts: 3,
  backoff: { type: 'fixed', delay: 1_000 },
}

/**
 * Recurring sweeps. One retry only: the next scheduled run is itself the
 * retry, and stacking attempts on a cron task is how a queue fills up with
 * duplicate sweeps.
 */
export const RETRY_SWEEP: RetryPolicy = {
  attempts: 1,
  backoff: { type: 'fixed', delay: 30_000 },
}
