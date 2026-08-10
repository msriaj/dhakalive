import type { RevalidationEvent } from '@dhakalive/core'

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

/**
 * Reconciles one document with the search index.
 *
 * Carries only an identity, never the content. By the time the job runs the
 * document may have changed again, and the job that eventually executes should
 * index what is true then — not a snapshot taken when an editor pressed save.
 */
export interface SearchIndexInput extends JobInput {
  collection: string
  documentId: string
}

/**
 * Clock-driven sweeps. Both are cron-scheduled and take no arguments — what
 * they act on is "everything that is due", which is a query, not an input.
 */
export type PublishScheduledInput = JobInput

export type ExpireBreakingInput = JobInput

/**
 * A cache invalidation that could not be performed in place.
 *
 * Carries the change itself rather than a target list. The endpoint that
 * receives it recomputes the paths, so a job cannot describe a purge that no
 * real edit could have produced.
 */
export interface RevalidateInput extends JobInput {
  event: RevalidationEvent
}

export interface TaskInputs {
  'prune-jobs': PruneJobsInput
  'search-index': SearchIndexInput
  'publish-scheduled': PublishScheduledInput
  'expire-breaking': ExpireBreakingInput
  revalidate: RevalidateInput
}

export type TaskName = keyof TaskInputs
