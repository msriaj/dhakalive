import { getServerEnv } from '@dhakalive/config'
import { getLogger } from '@dhakalive/observability'
import type { CollectionAfterChangeHook } from 'payload'

import { enqueue } from '../jobs/enqueue'
import { QUEUE } from '../jobs/queues'

/**
 * Queues a social photocard job when an article becomes published, or when its
 * photocard is approved.
 *
 * The hook only decides *whether* this save warrants a job; everything else —
 * rendering, the approval request, posting, recording — happens in the worker,
 * because an editor's Publish must not wait on a third-party API. All paths
 * arrive here: an editor's save, the scheduler's transition, the Telegram
 * webhook writing `approvalStatus`, and an admin flipping it in the CMS.
 *
 * Fires on transitions, not on state: a published article is saved many times
 * (corrections, autosaves of metadata), and each of those must not produce a
 * post. The task re-checks everything anyway, so a false positive here costs a
 * no-op job, never a duplicate post.
 */
export const queueSocialPhotocard: CollectionAfterChangeHook = ({ doc, previousDoc, req }) => {
  // The task recording a completed post is itself an update; without this, the
  // bookkeeping write would re-enter the hook it came from.
  if (req.context?.isSocialPostUpdate) return

  const env = getServerEnv()
  if (!env.SOCIAL_AUTOPOST_ENABLED) return

  const current = doc as { id?: unknown; workflowStatus?: unknown; socialPosts?: unknown }
  const previous = previousDoc as { workflowStatus?: unknown; socialPosts?: unknown } | undefined

  if (current.workflowStatus !== 'published') return

  const state = (current.socialPosts ?? {}) as Partial<Record<string, unknown>>
  const previousState = (previous?.socialPosts ?? {}) as Partial<Record<string, unknown>>

  const becamePublished = previous?.workflowStatus !== 'published'
  const becameApproved =
    state.approvalStatus === 'approved' && previousState.approvalStatus !== 'approved'

  if (!becamePublished && !becameApproved) return

  const allPosted = env.SOCIAL_AUTOPOST_PLATFORMS.every((platform) => state[`${platform}PostedAt`])
  if (allPosted) return

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
