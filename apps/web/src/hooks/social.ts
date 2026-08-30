import { getServerEnv } from '@dhakalive/config'
import { getLogger } from '@dhakalive/observability'
import type { CollectionAfterChangeHook } from 'payload'

import { enqueue } from '../jobs/enqueue'
import { QUEUE } from '../jobs/queues'

/**
 * Queues a Facebook photocard when an article becomes published.
 *
 * The hook only decides *whether* this save is a publication; everything else —
 * rendering, posting, recording — happens in the worker, because an editor's
 * Publish must not wait on a third-party API. Both publish paths arrive here:
 * an editor's save and the scheduler's transition run the same `afterChange`.
 *
 * Fires on the transition, not on the state: a published article is saved many
 * times (corrections, autosaves of metadata), and each of those must not
 * produce a Facebook post. The task re-checks `facebookPostedAt` anyway, so a
 * false positive here costs a no-op job, never a duplicate post.
 */
export const queueSocialPhotocard: CollectionAfterChangeHook = ({ doc, previousDoc, req }) => {
  // The task recording a completed post is itself an update; without this, the
  // bookkeeping write would re-enter the hook it came from.
  if (req.context?.isSocialPostUpdate) return

  if (!getServerEnv().SOCIAL_AUTOPOST_ENABLED) return

  const current = doc as { id?: unknown; workflowStatus?: unknown; socialPosts?: unknown }
  const previous = previousDoc as { workflowStatus?: unknown } | undefined

  if (current.workflowStatus !== 'published') return
  if (previous?.workflowStatus === 'published') return

  const posted = (current.socialPosts as { facebookPostedAt?: unknown } | undefined)
    ?.facebookPostedAt
  if (posted) return

  const id = current.id
  if (typeof id !== 'string' && typeof id !== 'number') return

  void enqueue({
    payload: req.payload,
    task: 'social-photocard',
    input: { articleId: String(id) },
    queue: QUEUE.content,
    req,
  }).catch((error: unknown) => {
    // Same shape as the search hook: `enqueue` never throws, this guards the
    // save against anything unexpected. A missed photocard is recoverable; a
    // failed publish is not.
    getLogger().error({ err: error, articleId: id }, 'Failed to queue social photocard')
  })
}
