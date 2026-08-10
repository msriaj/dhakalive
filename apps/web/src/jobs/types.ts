import type { JobInput } from './telemetry'

/**
 * The input shape of every task, in one place.
 *
 * Deliberately independent of Payload's generated `TypedJobs`: those types are
 * produced *from* the config, so relying on them inside the config is circular —
 * a fresh checkout could not compile far enough to generate them. This table is
 * what `enqueue` is typed against, and the task modules import their own input
 * type from here, so a mismatch between what is queued and what a handler
 * expects is still a compile error.
 */

/** Housekeeping sweep over the jobs table. */
export interface PruneJobsInput extends JobInput {
  /** Retention window for *completed* jobs. Failures are never pruned. */
  olderThanDays?: number | null
}

export interface TaskInputs {
  'prune-jobs': PruneJobsInput
}

export type TaskName = keyof TaskInputs
