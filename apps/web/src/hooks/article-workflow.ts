import {
  checkTransition,
  describeIssues,
  isArticleStatus,
  validatePublishable,
  type ArticleStatus,
  type ResolvedMedia,
} from '@dhakalive/core'
import { DEFAULT_LOCALE } from '@dhakalive/config'
import type { CollectionBeforeChangeHook, PayloadRequest } from 'payload'
import { APIError } from 'payload'

import { toAuthUser } from '../access'

/**
 * Enforces the article workflow.
 *
 * Every status change goes through the transition table in `@dhakalive/core`,
 * so a crafted request setting `status: "published"` on a draft is a validation
 * error rather than an unnoticed state change. Each accepted transition is
 * appended to `workflowHistory` with the actor, which is what makes "who
 * published this" answerable months later.
 */

/** Statuses that require the article to be complete. */
const REQUIRES_PUBLISH_GUARDS: readonly ArticleStatus[] = ['published', 'scheduled']

/** Article types that lead with something other than a hero image. */
const TYPES_WITHOUT_FEATURED_IMAGE = new Set(['live-blog'])

function idOf(value: unknown): string | number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'object') {
    const candidate = (value as { id?: unknown }).id
    return typeof candidate === 'string' || typeof candidate === 'number' ? candidate : null
  }
  return typeof value === 'string' || typeof value === 'number' ? value : null
}

/**
 * Resolves the featured image far enough to inspect its alt text.
 *
 * The relationship arrives as a bare id, and the alt-text requirement is the
 * entire point of the check — so one targeted lookup rather than raising the
 * collection's relationship depth for every read.
 */
async function resolveFeaturedImage(
  req: PayloadRequest,
  value: unknown,
): Promise<ResolvedMedia | null> {
  if (value && typeof value === 'object' && 'alt' in value) return value

  const id = idOf(value)
  if (id === null) return null

  const media = await req.payload.findByID({
    collection: 'media',
    id,
    depth: 0,
    req,
    locale: req.locale,
    disableErrors: true,
  })

  if (!media) return null
  return { id: media.id, alt: (media as { alt?: unknown }).alt }
}

export const enforceArticleWorkflow: CollectionBeforeChangeHook = async ({
  data,
  req,
  originalDoc,
  operation,
}) => {
  const actor = toAuthUser(req.user)

  const previousStatus: ArticleStatus =
    operation === 'create'
      ? 'draft'
      : isArticleStatus((originalDoc as { workflowStatus?: unknown } | undefined)?.workflowStatus)
        ? (originalDoc as { workflowStatus: ArticleStatus }).workflowStatus
        : 'draft'

  const nextStatus: unknown = data.workflowStatus ?? previousStatus

  // A new article always starts as a draft, whatever the request asked for.
  if (operation === 'create' && nextStatus !== 'draft') {
    throw new APIError('New articles must start as a draft', 400)
  }

  const statusChanged = nextStatus !== previousStatus

  if (statusChanged) {
    const ownerId = idOf((originalDoc as { createdBy?: unknown } | undefined)?.createdBy)
    const isOwner = actor !== null && ownerId !== null && String(ownerId) === String(actor.id)

    // `isSystem` is only ever set by the job runner, which passes it through
    // req.context; it is not reachable from an HTTP request body.
    const isSystem = req.context?.isSystemTransition === true

    const check = checkTransition(previousStatus, nextStatus, { user: actor, isOwner, isSystem })
    if (!check.ok) throw new APIError(check.reason, 403)

    if (isArticleStatus(nextStatus) && REQUIRES_PUBLISH_GUARDS.includes(nextStatus)) {
      const merged = { ...(originalDoc as Record<string, unknown>), ...data }
      const articleType = typeof merged.articleType === 'string' ? merged.articleType : 'standard'

      const validation = validatePublishable(
        {
          headline: merged.headline,
          slug: merged.slug,
          body: merged.body,
          authors: merged.authors,
          primaryCategory: merged.primaryCategory,
          language: req.locale ?? DEFAULT_LOCALE,
          featuredImage: await resolveFeaturedImage(req, merged.featuredImage),
        },
        { requireFeaturedImage: !TYPES_WITHOUT_FEATURED_IMAGE.has(articleType) },
      )

      if (!validation.ok) {
        throw new APIError(`Cannot publish: ${describeIssues(validation.issues)}`, 400)
      }
    }

    if (nextStatus === 'scheduled') {
      const scheduledAt = merge(data, originalDoc, 'scheduledAt')
      const timestamp = typeof scheduledAt === 'string' ? Date.parse(scheduledAt) : Number.NaN
      if (Number.isNaN(timestamp)) {
        throw new APIError('A scheduled article needs a publication date and time', 400)
      }
      if (timestamp <= Date.now()) {
        throw new APIError('Scheduled publication must be in the future', 400)
      }
    }

    // First publication stamps publishedAt; later republishing keeps the
    // original date so the story does not jump back to the top of feeds.
    if (nextStatus === 'published' && !merge(data, originalDoc, 'publishedAt')) {
      data.publishedAt = new Date().toISOString()
    }

    const entry = {
      from: previousStatus,
      to: nextStatus,
      at: new Date().toISOString(),
      actor: actor?.id ?? null,
      note: typeof data.workflowNote === 'string' ? data.workflowNote : null,
    }

    const history = Array.isArray(
      (originalDoc as { workflowHistory?: unknown[] } | undefined)?.workflowHistory,
    )
      ? (originalDoc as { workflowHistory: unknown[] }).workflowHistory
      : []

    data.workflowHistory = [...history, entry]
    // The note belongs to the transition record, not to the document.
    data.workflowNote = null
  }

  /**
   * Payload's own draft flag is derived from the editorial status rather than
   * set independently. It gives defence in depth: even a query that forgets to
   * filter on `status` still will not return a non-published article, because
   * Payload excludes drafts by default.
   */
  data._status = nextStatus === 'published' ? 'published' : 'draft'

  if (operation === 'create' && actor) {
    data.createdBy = actor.id
  }
  if (actor) {
    data.lastEditedBy = actor.id
  }

  return data
}

/** Reads a field from the incoming data, falling back to the persisted value. */
function merge(data: Record<string, unknown>, originalDoc: unknown, field: string): unknown {
  if (data[field] !== undefined) return data[field]
  return (originalDoc as Record<string, unknown> | undefined)?.[field]
}
