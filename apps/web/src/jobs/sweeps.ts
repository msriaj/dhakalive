import { getLogger } from '@dhakalive/observability'
import type { Payload } from 'payload'

import { enqueue } from './enqueue'
import { QUEUE, type QueueName } from './queues'
import type { TaskName } from './types'

/**
 * Clock-driven sweeps, scheduled by the worker rather than by Payload.
 *
 * Payload can attach a `schedule: [{ cron }]` to a task. This deliberately does
 * not use it, for one observed defect and one design mismatch.
 *
 * The defect: `handleSchedules` reads the `payload-jobs-stats` global once, then
 * hands that same snapshot to every schedule's `afterSchedule`, each of which
 * writes the whole object back. With schedules in more than one queue the last
 * write drops the earlier queues' entries — observed directly here, where the
 * stats global recorded only `maintenance` while the `scheduled` queue's tasks
 * were being scheduled repeatedly. A task whose `lastScheduledRun` is never
 * recorded looks due on every tick.
 *
 * The mismatch: the duplicate guard filters on `meta.scheduled`, a path inside a
 * JSON column, rather than on the indexed columns beside it.
 *
 * Neither is worth debugging inside a dependency for something this small. What
 * replaces it is an interval per sweep and a check for an outstanding job of the
 * same kind against indexed columns — about forty lines, entirely inspectable.
 * The sweeps are idempotent ("do whatever is due right now"), so the worst case
 * of an extra run is a query that finds nothing.
 */

export interface Sweep {
  task: TaskName
  queue: QueueName
  /** Minimum gap between queueing this sweep. */
  everyMs: number
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE

export const SWEEPS: readonly Sweep[] = [
  /**
   * Scheduled publication. A minute is the resolution an editor picks a time
   * at, so anything finer buys nothing; anything coarser makes "publish at
   * 09:00" mean something vaguer than it says.
   */
  { task: 'publish-scheduled', queue: QUEUE.scheduled, everyMs: MINUTE },

  // A ticker entry lingering a few extra minutes is not the same class of
  // problem as a story publishing late.
  { task: 'expire-breaking', queue: QUEUE.scheduled, everyMs: 5 * MINUTE },

  { task: 'prune-jobs', queue: QUEUE.maintenance, everyMs: 6 * HOUR },
]

/**
 * Tracks when each sweep was last queued.
 *
 * In memory on purpose. Persisting it would need its own table and its own
 * consistency story, and the only cost of losing it is one extra sweep after a
 * worker restart — which finds nothing due and returns.
 */
export type SweepState = Map<TaskName, number>

export function createSweepState(): SweepState {
  return new Map()
}

/**
 * Is a job of this kind already waiting or running?
 *
 * Queried on `taskSlug`, `completedAt` and `hasError`, all of which are indexed
 * columns. This is the guard that stops a slow sweep from having a second copy
 * queued behind it.
 */
async function hasOutstandingJob(payload: Payload, task: TaskName): Promise<boolean> {
  const result = await payload.count({
    collection: 'payload-jobs',
    where: {
      and: [
        { taskSlug: { equals: task } },
        { completedAt: { exists: false } },
        // A dead-lettered job stays in the table for an operator to look at; it
        // must not block the next sweep from running.
        { hasError: { not_equals: true } },
      ],
    },
    overrideAccess: true,
  })

  return result.totalDocs > 0
}

/**
 * Queues whichever sweeps are due. Returns the tasks queued, for logging.
 *
 * Never throws: this runs inside the worker's poll loop, and a failure to queue
 * a sweep must not stop the loop from running the jobs already waiting.
 */
export async function queueDueSweeps(options: {
  payload: Payload
  state: SweepState
  now?: number
}): Promise<TaskName[]> {
  const { payload, state, now = Date.now() } = options
  const queued: TaskName[] = []

  for (const sweep of SWEEPS) {
    const last = state.get(sweep.task) ?? 0
    if (now - last < sweep.everyMs) continue

    try {
      if (await hasOutstandingJob(payload, sweep.task)) {
        /**
         * Deliberately not stamping the state here. If the previous sweep is
         * stuck, the next tick should look again rather than wait out a whole
         * interval before noticing it has finished.
         */
        continue
      }

      const ok = await enqueue({
        payload,
        task: sweep.task,
        input: {},
        queue: sweep.queue,
      })

      if (ok) {
        state.set(sweep.task, now)
        queued.push(sweep.task)
      }
    } catch (error) {
      getLogger().error({ err: error, task: sweep.task }, 'Could not queue sweep')
    }
  }

  return queued
}
