import { newCorrelationId, normaliseCorrelationId, withCorrelation } from '@dhakalive/observability'
import type { Field, TaskConfig } from 'payload'

/**
 * Correlation and failure logging for background work.
 *
 * A job runs minutes after — and in a different process from — the request that
 * caused it. The only thread back to that request is the correlation id, so it
 * travels in the job's own input and every handler logs with it. Without that,
 * "the article published but the CDN still serves the old copy" is unanswerable:
 * the purge failure is in the worker's logs and the publish is in the web
 * replica's, with nothing joining them.
 */

/** Every task input carries this. */
export interface JobInput {
  correlationId?: string | null
}

/**
 * The `correlationId` field, for a task's `inputSchema`.
 *
 * Declared so the id is visible in the admin job view — which is where someone
 * looking at a failed job actually is when they need it.
 */
export const correlationIdField: Field = {
  name: 'correlationId',
  type: 'text',
  admin: { description: 'Ties this job back to the request that queued it.' },
}

/**
 * Reads the correlation id out of a job input, minting one if it is absent or
 * implausible. The value reaches log files, so it is validated rather than
 * trusted — an attacker-controlled string in a log line is an injection vector.
 */
export function correlationOf(input: unknown): string {
  if (!input || typeof input !== 'object') return newCorrelationId()
  const value = (input as JobInput).correlationId
  return normaliseCorrelationId(typeof value === 'string' ? value : null)
}

/** Child logger bound to the job's correlation id and task slug. */
export function taskLogger(task: string, input: unknown, context: Record<string, unknown> = {}) {
  return withCorrelation(correlationOf(input), { task, ...context })
}

type TaskCallback = NonNullable<TaskConfig<{ input: object; output: object }>['onFail']>

/**
 * `onFail` handler that logs every failed attempt, and says plainly when the
 * last one has been used up.
 *
 * Payload calls `onFail` once per attempt, not once per job, so the attempt
 * count is what distinguishes "will retry" from "this job is now dead". The
 * distinction matters: the first is noise, the second is an operator's problem.
 *
 * Nothing is written to the job document here. Payload already records the
 * error, the full per-attempt log and `hasError` on the job itself, and a
 * parallel copy would only drift.
 */
export function logFailure(task: string, attempts: number): TaskCallback {
  return ({ input, job, taskStatus }) => {
    const tried = (taskStatus?.totalTried ?? 0) + 1
    const exhausted = tried > attempts
    const logger = taskLogger(task, input, {
      jobId: job.id,
      attempt: tried,
      attempts: attempts + 1,
    })

    if (exhausted) {
      /**
       * The job is now dead-lettered: Payload sets `hasError` and stops
       * retrying, and the row stays in `payload-jobs` with its full attempt log
       * until an operator deals with it. `prune-jobs` deliberately never
       * deletes these.
       */
      logger.error(
        { input, deadLettered: true },
        `Job ${task} failed permanently after ${tried} attempts`,
      )
      return
    }

    logger.warn({ input }, `Job ${task} attempt ${tried} failed, will retry`)
  }
}

/** Matching success line, at debug: useful when tracing, invisible otherwise. */
export function logSuccess(task: string): TaskCallback {
  return ({ input, job }) => {
    taskLogger(task, input, { jobId: job.id }).debug(`Job ${task} succeeded`)
  }
}
