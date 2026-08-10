import config from '@payload-config'
import { getPayload, type Payload } from 'payload'

import { getServerEnv } from '@dhakalive/config'
import { initLogger, newCorrelationId } from '@dhakalive/observability'
import type { SearchDocument } from '@dhakalive/search'

import { buildArticleDocuments, buildPageDocuments } from '../lib/search/documents'
import { getSearchProvider } from '../lib/search/provider'

/**
 * Rebuilds the whole search index.
 *
 * Needed for three things: standing up a new environment, recovering from a
 * dropped index, and applying a change to how documents are built — a new field,
 * a different body cap, a corrected URL shape. None of those are expressible as
 * per-document jobs, because the trigger is a code change rather than a content
 * change.
 *
 * Runs in the foreground rather than by queueing one job per document. A
 * hundred thousand queued jobs is a worse artefact than a script that takes a
 * few minutes and reports progress, and this way the operator watching it knows
 * when it is finished.
 *
 * Existing rows are updated in place and never cleared first. A reader
 * searching during a rebuild sees the previous index, not an empty one.
 * Documents that have since become private are removed as they are encountered,
 * because the builder returns no rows for them.
 */

const env = getServerEnv()

const logger = initLogger({
  level: env.LOG_LEVEL,
  pretty: env.NODE_ENV !== 'production',
  service: 'dhakalive-reindex',
  environment: env.NODE_ENV,
  version: env.NEXT_PUBLIC_APP_VERSION,
})

const correlationId = newCorrelationId()

/** Documents read per page. Small enough that one batch is not a long transaction. */
const PAGE_SIZE = 50

/** Index rows written per statement. */
const WRITE_BATCH = 100

type Indexable = 'articles' | 'pages'

interface Progress {
  scanned: number
  indexed: number
  removed: number
}

async function rebuild(payload: Payload, collection: Indexable): Promise<Progress> {
  const provider = getSearchProvider(payload)
  const progress: Progress = { scanned: 0, indexed: 0, removed: 0 }

  let page = 1
  let pending: SearchDocument[] = []

  const flush = async (): Promise<void> => {
    if (pending.length === 0) return
    await provider.index(pending)
    progress.indexed += pending.length
    pending = []
  }

  for (;;) {
    /**
     * `overrideAccess: true` so unpublished documents are *seen* — they still
     * have to be visited, because a document that used to be public may have
     * stale rows in the index that need removing. Deliberately without
     * `draft: true`, which pivots the query onto the versions table; the main
     * row is what carries the current status.
     */
    const result = await payload.find({
      collection,
      limit: PAGE_SIZE,
      page,
      depth: 0,
      overrideAccess: true,
      sort: 'id',
    })

    if (result.docs.length === 0) break

    for (const doc of result.docs) {
      progress.scanned += 1

      const documents =
        collection === 'articles'
          ? await buildArticleDocuments({ payload, id: doc.id })
          : await buildPageDocuments({ payload, id: doc.id })

      if (documents.length === 0) {
        await provider.removeDocument(collection, String(doc.id))
        progress.removed += 1
        continue
      }

      pending.push(...documents)
      if (pending.length >= WRITE_BATCH) await flush()
    }

    logger.info({ correlationId, collection, ...progress }, 'Reindex progress')

    if (!result.hasNextPage) break
    page += 1
  }

  await flush()
  return progress
}

async function main(): Promise<void> {
  const started = Date.now()
  logger.info({ correlationId, provider: env.SEARCH_PROVIDER }, 'Reindex starting')

  const payload = await getPayload({ config })

  const articles = await rebuild(payload, 'articles')
  const pages = await rebuild(payload, 'pages')

  logger.info(
    {
      correlationId,
      ms: Date.now() - started,
      articles,
      pages,
    },
    'Reindex complete',
  )
}

await main()
