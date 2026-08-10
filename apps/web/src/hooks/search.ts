import { getLogger } from '@dhakalive/observability'
import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, PayloadRequest } from 'payload'

import { enqueue } from '../jobs/enqueue'
import { QUEUE } from '../jobs/queues'

/**
 * Keeps the search index in step with the content.
 *
 * The hooks queue work; they never touch the index themselves. Two reasons:
 * an editor pressing Publish must not wait on the index, and indexing needs the
 * document resolved a level deep — category, authors, image — which is a
 * handful of extra queries that have no business inside a save.
 *
 * There is no separate de-index hook. `search-index` removes a document that is
 * no longer publicly visible, so unpublishing, archiving and emptying a required
 * field all take the same path as publishing, and the visibility rule lives in
 * exactly one place.
 *
 * The job is queued on the request's transaction. A save that rolls back
 * therefore takes its indexing job with it, rather than leaving a job that would
 * index a version that never existed.
 */
function queueIndex(collection: string, documentId: string | number, req: PayloadRequest): void {
  void enqueue({
    payload: req.payload,
    task: 'search-index',
    input: { collection, documentId: String(documentId) },
    queue: QUEUE.content,
    req,
  }).catch((error: unknown) => {
    // `enqueue` already swallows and logs its own failures; this catch exists
    // only so an unexpected throw cannot reject inside a Payload hook and fail
    // the editor's save over a search-index update.
    getLogger().error({ err: error, collection, documentId }, 'Failed to queue search indexing')
  })
}

/** Runs on every save, including status changes that make a document private. */
export function indexOnChange(collection: string): CollectionAfterChangeHook {
  return ({ doc, req }) => {
    const id = (doc as { id?: unknown }).id
    if (typeof id !== 'string' && typeof id !== 'number') return
    queueIndex(collection, id, req)
  }
}

/**
 * Deletion takes the same path: the builder finds no document, so the handler
 * removes every locale. One task, one rule.
 */
export function deindexOnDelete(collection: string): CollectionAfterDeleteHook {
  return ({ doc, req }) => {
    const id = (doc as { id?: unknown }).id
    if (typeof id !== 'string' && typeof id !== 'number') return
    queueIndex(collection, id, req)
  }
}
