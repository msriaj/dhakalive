import { DEFAULT_LOCALE, isLocale, type Locale } from '@dhakalive/config'
import { isPubliclyVisible, normaliseRedirectPath } from '@dhakalive/core'
import { getLogger } from '@dhakalive/observability'
import type { CollectionAfterChangeHook, PayloadRequest } from 'payload'

import { articlePath } from '../lib/routes'
import { resolveCategorySlug } from './relationships'

/**
 * Records a redirect when a published article's URL changes.
 *
 * This is the gap it closes: renaming a slug or moving a story to another
 * section already purged the old URL from the caches, and then left it
 * 404-ing — for every reader who had bookmarked it, every inbound link, and
 * every search result until the index caught up. The purge was the easy half.
 *
 * Only for articles that were already public. A draft being renamed has no old
 * URL anyone could have followed, and recording redirects for it would fill the
 * table with entries for URLs that never existed.
 */

interface ArticleDoc {
  id: string | number
  slug?: unknown
  primaryCategory?: unknown
  workflowStatus?: unknown
}

function localeOf(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE
}

/**
 * Writes one entry, tolerating the case where it already exists.
 *
 * `from` is unique, and a story that moves twice — A → B, then B → C — produces
 * a second entry keyed on B while the entry for A still points at B. That chain
 * resolves correctly, and rewriting A to point at C here would mean walking the
 * table on every save for a benefit the resolver already provides.
 */
async function record(req: PayloadRequest, from: string, to: string, note: string): Promise<void> {
  const existing = await req.payload.find({
    collection: 'redirects',
    where: { from: { equals: from } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })

  if (existing.docs.length > 0) {
    /**
     * An editor's manual entry is never overwritten. If somebody has already
     * decided where this URL should go, a slug change is not grounds to
     * silently disagree with them.
     */
    const current = existing.docs[0]
    if (!current || current.source === 'manual') return

    await req.payload.update({
      collection: 'redirects',
      id: current.id,
      data: { to, note },
      overrideAccess: true,
      req,
    })
    return
  }

  await req.payload.create({
    collection: 'redirects',
    data: { from, to, permanence: 'permanent', source: 'automatic', isActive: true, note },
    overrideAccess: true,
    req,
  })
}

export const recordArticleRedirect: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
}) => {
  const current = (doc ?? {}) as ArticleDoc
  const previous = (previousDoc ?? {}) as ArticleDoc

  // Nothing to preserve if the story was never publicly reachable.
  if (!isPubliclyVisible(previous.workflowStatus)) return

  const locale = localeOf(req.locale)

  const previousSlug = typeof previous.slug === 'string' ? previous.slug : null
  const currentSlug = typeof current.slug === 'string' ? current.slug : null

  /**
   * `previousDoc` carries the category as a bare id while `doc` carries it
   * populated, so both go through the resolver. Reading `.slug` off the
   * previous one directly always yields nothing, and the redirect would never
   * be written.
   */
  const currentCategory = await resolveCategorySlug(req, current.primaryCategory)
  const previousCategory = await resolveCategorySlug(
    req,
    previous.primaryCategory,
    current.primaryCategory,
  )

  if (!previousSlug || !previousCategory || !currentSlug || !currentCategory) return
  if (previousSlug === currentSlug && previousCategory === currentCategory) return

  const from = normaliseRedirectPath(articlePath(locale, previousCategory, previousSlug))
  const to = normaliseRedirectPath(articlePath(locale, currentCategory, currentSlug))
  if (!from || !to || from === to) return

  try {
    await record(req, from, to, `Automatic: article ${String(current.id)} moved`)
    getLogger().info({ from, to, articleId: current.id }, 'Recorded automatic redirect')
  } catch (error) {
    /**
     * Never rethrow. The article has already been saved at its new URL; failing
     * the request now would roll that back over a redirect entry, which is the
     * lesser of the two things at stake.
     */
    getLogger().error({ err: error, from, to }, 'Could not record automatic redirect')
  }
}
