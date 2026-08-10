import config from '@payload-config'
import { getPayload } from 'payload'

import { getServerEnv } from '@dhakalive/config'
import { initLogger, newCorrelationId } from '@dhakalive/observability'

import { createSweepState, queueDueSweeps } from '@web/jobs/sweeps'

/**
 * Background job runner.
 *
 * This runs as its own container so that scheduled publishing, search indexing
 * and cache purges never execute inside a web replica. Two reasons: an editor's
 * Publish request must not block on third-party I/O, and jobs must have exactly
 * one runner — N web replicas polling the same queue would publish the same
 * scheduled article N times.
 *
 * Each tick does two things, in order:
 *
 *   1. Queues whichever recurring sweeps are due — scheduled publication,
 *      breaking-flag expiry, job pruning. See `jobs/sweeps.ts` for why this is
 *      driven from here rather than by Payload's own cron scheduling.
 *   2. Runs whatever is due across every queue.
 *
 * Both are driven from this one loop rather than from Payload's `autoRun`,
 * because `autoRun` would start a cron inside any process that loads the config
 * — including every web replica.
 */

const env = getServerEnv()

const logger = initLogger({
  level: env.LOG_LEVEL,
  pretty: env.NODE_ENV === 'development',
  service: 'dhakalive-worker',
  environment: env.NODE_ENV,
  version: env.NEXT_PUBLIC_APP_VERSION,
})

/**
 * Jobs executed per tick. Sized against the pool in `DATABASE_POOL_MAX`: jobs
 * run in parallel and each one holds a connection, so a batch larger than the
 * pool converts into connection-timeout errors rather than throughput.
 */
const JOB_BATCH_LIMIT = 10

let shuttingDown = false
let activeRun: Promise<unknown> | null = null

async function main(): Promise<void> {
  const payload = await getPayload({ config })
  const sweeps = createSweepState()

  /**
   * `payload.jobs.run()` is NOT a safe no-op when nothing is registered: with no
   * tasks or workflows Payload never creates the `payload-jobs` collection, and
   * the run throws while writing job status. Guarded rather than assumed, so a
   * config that registers no tasks idles instead of erroring every tick.
   */
  const taskCount = payload.config.jobs?.tasks?.length ?? 0
  const workflowCount = payload.config.jobs?.workflows?.length ?? 0
  const hasJobs = taskCount + workflowCount > 0

  logger.info(
    { pollIntervalMs: env.JOBS_POLL_INTERVAL_MS, taskCount, workflowCount },
    hasJobs ? 'Worker started' : 'Worker started — no jobs registered yet, idling',
  )

  while (!shuttingDown) {
    const correlationId = newCorrelationId()
    try {
      if (!hasJobs) {
        await sleep(env.JOBS_POLL_INTERVAL_MS)
        continue
      }

      const tick = (async () => {
        /**
         * Sweeps first, so one that has just come due runs in this same tick
         * rather than waiting for the next one. `queueDueSweeps` never throws;
         * a missed sweep is recoverable, whereas skipping the run below would
         * stall every job already waiting.
         */
        const queued = await queueDueSweeps({ payload, state: sweeps })
        if (queued.length > 0) logger.info({ correlationId, queued }, 'Sweeps queued')

        return payload.jobs.run({ allQueues: true, limit: JOB_BATCH_LIMIT })
      })()

      activeRun = tick
      const result = await tick
      // `jobStatus` is keyed by job id; its value shape is Payload-internal, so
      // only the count is read here rather than trusting the payload structure.
      const completed = Object.keys(result.jobStatus ?? {}).length
      if (completed > 0) {
        logger.info({ correlationId, completed }, 'Job batch processed')
      }
    } catch (error) {
      // A failing batch must not kill the runner; the next tick retries.
      logger.error({ correlationId, err: error }, 'Job batch failed')
    } finally {
      activeRun = null
    }

    await sleep(env.JOBS_POLL_INTERVAL_MS)
  }

  logger.info('Worker loop exited')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    // Do not hold the event loop open once shutdown has been requested.
    timer.unref()
  })
}

/**
 * Graceful shutdown: stop accepting new batches, let the in-flight batch finish,
 * then exit. Killing mid-batch is what produces half-published articles.
 */
function registerShutdown(): void {
  const handle = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      logger.warn({ signal }, 'Second signal received — exiting immediately')
      process.exit(1)
    }
    shuttingDown = true
    logger.info({ signal }, 'Shutdown requested, finishing in-flight batch')

    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out — forcing exit')
      process.exit(1)
    }, 30_000)
    forceExit.unref()

    void Promise.resolve(activeRun).finally(() => {
      clearTimeout(forceExit)
      process.exit(0)
    })
  }

  process.on('SIGTERM', handle)
  process.on('SIGINT', handle)
}

registerShutdown()

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Worker failed to start')
  process.exit(1)
})
