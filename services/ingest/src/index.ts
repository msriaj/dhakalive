import config from '@payload-config'
import { getPayload } from 'payload'

import { getServerEnv } from '@dhakalive/config'
import { initLogger, newCorrelationId } from '@dhakalive/observability'

import { PublishSkipped, alreadyIngested, publishIngested } from './publish.js'
import { RewriteError, rewriteArticle } from './rewrite.js'
import { IngestParseError, fetchPage, parseDetail, parseListing } from './source.js'

/**
 * Automated ingest.
 *
 * Its own container, separate from the job worker, for a dependency reason and
 * an operational one. An HTML parser and a model client have no business in the
 * Next bundle graph, and nothing in `apps/web` imports this service — the
 * dependency runs one way, into the Payload config and no further. Operationally
 * it fails differently from the rest of the queue: a model outage should stall
 * ingest and leave scheduled publication, search indexing and cache purges
 * running normally.
 *
 * Each pass:
 *
 *   1. Read the listing page.
 *   2. Drop anything already ingested — before the detail fetch and before the
 *      model call, which are the two expensive steps.
 *   3. For each remaining story: fetch, rewrite, upload the image, publish.
 *
 * There is no retry queue. Idempotency comes from the dedupe check rather than
 * from bookkeeping: a story that fails is simply still absent on the next pass,
 * so it is retried by construction. What that does not give is a dead-letter
 * view, so a story that fails permanently would be attempted every pass forever
 * — hence the failure ledger below.
 */

const env = getServerEnv()

const logger = initLogger({
  level: env.LOG_LEVEL,
  pretty: env.NODE_ENV === 'development',
  service: 'dhakalive-ingest',
  environment: env.NODE_ENV,
  version: env.NEXT_PUBLIC_APP_VERSION,
})

/** How often to read the listing page. */
const POLL_INTERVAL_MS = 5 * 60_000

/**
 * Consecutive failures before a story is given up on.
 *
 * Without this a story that can never succeed — an unmapped section, an image
 * the source has deleted — is refetched and re-sent to the model on every pass,
 * indefinitely. Three attempts is enough to ride out a transient upstream error
 * and few enough that a systematic failure stops costing money quickly.
 */
const MAX_ATTEMPTS = 3

/**
 * In memory on purpose. Persisting it would need its own table and its own
 * consistency story, and the cost of losing it is that a handful of known-bad
 * stories are retried once more after a restart.
 */
const failures = new Map<string, number>()

let shuttingDown = false
let activePass: Promise<unknown> | null = null

function recordFailure(externalId: string, error: unknown, correlationId: string): void {
  const attempts = (failures.get(externalId) ?? 0) + 1
  failures.set(externalId, attempts)

  const giveUp = attempts >= MAX_ATTEMPTS
  logger[giveUp ? 'error' : 'warn'](
    { correlationId, externalId, attempts, err: error },
    giveUp ? 'Giving up on story after repeated failures' : 'Story failed, will retry next pass',
  )
}

async function runPass(payload: Awaited<ReturnType<typeof getPayload>>): Promise<void> {
  const correlationId = newCorrelationId()
  const sourceUrl = env.INGEST_SOURCE_URL
  if (!sourceUrl) return

  const listing = parseListing(await fetchPage(sourceUrl), sourceUrl)
  logger.info({ correlationId, found: listing.length }, 'Listing read')

  let published = 0
  let considered = 0

  for (const item of listing) {
    if (shuttingDown) break
    if (published >= env.INGEST_MAX_PER_RUN) {
      logger.info({ correlationId, published }, 'Hit the per-pass cap; rest waits for next pass')
      break
    }
    if ((failures.get(item.externalId) ?? 0) >= MAX_ATTEMPTS) continue

    try {
      // Cheapest check first: one indexed count against two columns, before any
      // page fetch and long before the model is asked for anything.
      if (await alreadyIngested(payload, item.externalId)) continue

      considered += 1

      const detail = parseDetail(await fetchPage(item.url), item)

      const rewrite = await rewriteArticle(detail, {
        apiKey: env.OPENAI_API_KEY ?? '',
        model: env.OPENAI_MODEL,
      })

      await publishIngested({ payload, detail, rewrite, correlationId })

      published += 1
      failures.delete(item.externalId)
    } catch (error) {
      /**
       * A skip is a decision, not a fault — an unmapped section or a story with
       * no image is working as intended and should not be retried into the
       * failure ledger at error level. Everything else is a genuine failure.
       */
      if (error instanceof PublishSkipped) {
        failures.set(item.externalId, MAX_ATTEMPTS)
        logger.info(
          { correlationId, externalId: item.externalId, reason: error.message },
          'Story skipped',
        )
        continue
      }

      if (error instanceof IngestParseError || error instanceof RewriteError) {
        recordFailure(item.externalId, error, correlationId)
        continue
      }

      recordFailure(item.externalId, error, correlationId)
    }
  }

  if (considered > 0) {
    logger.info({ correlationId, considered, published }, 'Ingest pass complete')
  }
}

async function main(): Promise<void> {
  if (!env.INGEST_ENABLED) {
    logger.info('INGEST_ENABLED is false — ingest service idling')
    // Stay up rather than exiting: a container that exits cleanly looks like a
    // crash loop to an orchestrator that is configured to restart it.
    while (!shuttingDown) await sleep(POLL_INTERVAL_MS)
    return
  }

  const payload = await getPayload({ config })

  logger.info(
    { source: env.INGEST_SOURCE_URL, model: env.OPENAI_MODEL, maxPerRun: env.INGEST_MAX_PER_RUN },
    'Ingest started',
  )

  while (!shuttingDown) {
    try {
      const pass = runPass(payload)
      activePass = pass
      await pass
    } catch (error) {
      // A failing pass must not kill the service; the next one retries.
      logger.error({ err: error }, 'Ingest pass failed')
    } finally {
      activePass = null
    }

    await sleep(POLL_INTERVAL_MS)
  }

  logger.info('Ingest loop exited')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    timer.unref()
  })
}

/**
 * Graceful shutdown: stop starting stories, let the in-flight one finish. Killed
 * mid-story is how an article ends up published with a half-written body.
 */
function registerShutdown(): void {
  const handle = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      logger.warn({ signal }, 'Second signal received — exiting immediately')
      process.exit(1)
    }
    shuttingDown = true
    logger.info({ signal }, 'Shutdown requested, finishing in-flight story')

    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out — forcing exit')
      process.exit(1)
    }, 30_000)
    forceExit.unref()

    void Promise.resolve(activePass).finally(() => {
      clearTimeout(forceExit)
      process.exit(0)
    })
  }

  process.on('SIGTERM', handle)
  process.on('SIGINT', handle)
}

registerShutdown()

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Ingest service failed to start')
  process.exit(1)
})
