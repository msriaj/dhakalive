import type { TaskConfig } from 'payload'

import { buildArticleDocuments, buildPageDocuments } from '../../lib/search/documents'
import { getSearchProvider } from '../../lib/search/provider'
import { RETRY_REMOTE } from '../queues'
import { correlationIdField, logFailure, taskLogger } from '../telemetry'
import type { SearchIndexInput } from '../types'

/**
 * Brings the search index into line with one document.
 *
 * "Index" and "de-index" are the same operation from the job's point of view,
 * which is why there is one task and not two. The document builder returns rows
 * only for content that is publicly visible, so an article that has been
 * unpublished, archived or emptied produces no rows — and the handler removes
 * whatever is there. A separate de-index task would be a second place for the
 * visibility rule to live, and the two would eventually disagree.
 *
 * Idempotent by construction: indexing is an upsert keyed on
 * (collection, document, locale), and removal is a delete of the same key. A
 * retry after a partial failure converges on the same state.
 */

const INDEXABLE = ['articles', 'pages'] as const

type IndexableCollection = (typeof INDEXABLE)[number]

function isIndexable(value: string): value is IndexableCollection {
  return (INDEXABLE as readonly string[]).includes(value)
}

interface SearchIndexOutput {
  indexed: number
  removed: boolean
  [k: string]: unknown
}

export const searchIndex: TaskConfig<{ input: SearchIndexInput; output: SearchIndexOutput }> = {
  slug: 'search-index',
  label: 'Update the search index for a document',
  retries: RETRY_REMOTE,

  inputSchema: [
    correlationIdField,
    { name: 'collection', type: 'text', required: true },
    { name: 'documentId', type: 'text', required: true },
  ],

  outputSchema: [
    { name: 'indexed', type: 'number' },
    { name: 'removed', type: 'checkbox' },
  ],

  /**
   * One job per document at a time, and a new job supersedes a pending one.
   *
   * This is the idempotency key. An editor saving five times in a minute queues
   * one job, and the job that eventually runs reads the article as it stands
   * then — so superseding never loses an edit, it only skips work that a later
   * job would redo. `exclusive` additionally stops two runners racing on the
   * same row and writing the older version last.
   */
  concurrency: {
    key: ({ input }) => `search-index:${input.collection}:${input.documentId}`,
    exclusive: true,
    supersedes: true,
  },

  onFail: logFailure('search-index', RETRY_REMOTE.attempts ?? 0),

  handler: async ({ input, req }) => {
    const logger = taskLogger('search-index', input, {
      collection: input.collection,
      documentId: input.documentId,
    })

    if (!isIndexable(input.collection)) {
      // Not an error worth retrying: the job is malformed and always will be.
      logger.warn('Ignoring index request for a collection that is not indexed')
      return { output: { indexed: 0, removed: false } }
    }

    const provider = getSearchProvider(req.payload)

    const documents =
      input.collection === 'articles'
        ? await buildArticleDocuments({ payload: req.payload, id: input.documentId, req })
        : await buildPageDocuments({ payload: req.payload, id: input.documentId, req })

    if (documents.length === 0) {
      /**
       * The document is gone, or is no longer public. Removing every locale
       * covers both, and covers the case where it was never indexed — a delete
       * of nothing is not an error.
       */
      await provider.removeDocument(input.collection, String(input.documentId))
      logger.info('Removed document from the search index')
      return { output: { indexed: 0, removed: true } }
    }

    await provider.index(documents)
    logger.info({ locales: documents.length }, 'Indexed document')

    return { output: { indexed: documents.length, removed: false } }
  },
}
