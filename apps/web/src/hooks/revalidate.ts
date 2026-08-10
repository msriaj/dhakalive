import { DEFAULT_LOCALE, isLocale, type Locale } from '@dhakalive/config'
import { isPubliclyVisible, type RevalidationEvent } from '@dhakalive/core'
import { getLogger } from '@dhakalive/observability'
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  GlobalAfterChangeHook,
} from 'payload'

/**
 * Collection and global hooks that describe a change to the revalidation
 * service. They decide nothing about *which* pages to purge — that lives in
 * `computeRevalidationTargets`.
 *
 * Both `next/server` and the revalidation service are imported **dynamically**.
 * The Payload config is loaded by more than Next: the `payload` CLI, the job
 * runner and seed scripts all import it, and a static import chain reaching
 * `server-only` makes every one of them fail at startup. Deferring the import
 * to the moment the hook fires keeps the config loadable everywhere.
 */

/**
 * Runs invalidation after the response is sent.
 *
 * An editor pressing Publish must not wait on the Cloudflare API; a slow or
 * failing CDN would otherwise present as a hanging save.
 */
function schedule(buildEvent: () => RevalidationEvent): void {
  const run = async (): Promise<void> => {
    const { revalidateFor } = await import('../lib/cache/revalidation-service')
    await revalidateFor(buildEvent())
  }

  const fail = (error: unknown): void => {
    // Never rethrow: the content is already saved, and a failed purge is a
    // stale page rather than a lost story.
    getLogger().error({ err: error }, 'Revalidation failed')
  }

  void (async () => {
    try {
      const { after } = await import('next/server')
      after(() => run().catch(fail))
    } catch {
      // Outside a Next request — CLI, seeds, worker. Run inline; those contexts
      // are not latency-sensitive. Phase 6 moves this onto the job queue.
      await run().catch(fail)
    }
  })()
}

/**
 * Payload types hook documents as `any`. Narrowing once, here, keeps every hook
 * below free of unchecked member access — and means a renamed field surfaces as
 * a type error rather than as silently missing invalidation.
 */
interface ChangedDoc {
  id: string | number
  slug?: unknown
  primaryCategory?: unknown
  tags?: unknown
  authors?: unknown
  publishedAt?: unknown
  workflowStatus?: unknown
  liveBlog?: unknown
}

function asDoc(value: unknown): ChangedDoc {
  return (value ?? {}) as ChangedDoc
}

function localeOf(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE
}

function idOf(value: unknown): string | number | null {
  if (typeof value === 'string' || typeof value === 'number') return value
  if (value && typeof value === 'object') {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'string' || typeof id === 'number') return id
  }
  return null
}

function slugOf(value: unknown): string | null {
  if (value && typeof value === 'object') {
    const slug = (value as { slug?: unknown }).slug
    if (typeof slug === 'string') return slug
  }
  return null
}

function idsOf(value: unknown): (string | number)[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const id = idOf(entry)
    return id === null ? [] : [id]
  })
}

function slugsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const slug = slugOf(entry)
    return slug === null ? [] : [slug]
  })
}

/** Articles carry the most invalidation surface: URL, section, authors, tags, archive. */
export const revalidateArticle: CollectionAfterChangeHook = ({ doc, previousDoc, req }) => {
  const current = asDoc(doc)
  const previous = asDoc(previousDoc)

  const event: RevalidationEvent = {
    type: 'article',
    locale: localeOf(req.locale),
    article: {
      id: current.id,
      slug: typeof current.slug === 'string' ? current.slug : null,
      previousSlug: typeof previous.slug === 'string' ? previous.slug : null,
    },
    categorySlug: slugOf(current.primaryCategory),
    previousCategorySlug: slugOf(previous.primaryCategory),
    categoryId: idOf(current.primaryCategory),
    tagIds: idsOf(current.tags),
    authorIds: idsOf(current.authors),
    authorSlugs: slugsOf(current.authors),
    publishedAt: typeof current.publishedAt === 'string' ? current.publishedAt : null,
    wasPublic: isPubliclyVisible(previous.workflowStatus),
    isPublic: isPubliclyVisible(current.workflowStatus),
  }

  schedule(() => event)
}

export const revalidateArticleDeletion: CollectionAfterDeleteHook = ({ doc, req }) => {
  const removed = asDoc(doc)

  schedule(() => ({
    type: 'article',
    locale: localeOf(req.locale),
    article: { id: removed.id, slug: typeof removed.slug === 'string' ? removed.slug : null },
    categorySlug: slugOf(removed.primaryCategory),
    categoryId: idOf(removed.primaryCategory),
    tagIds: idsOf(removed.tags),
    authorIds: idsOf(removed.authors),
    authorSlugs: slugsOf(removed.authors),
    publishedAt: typeof removed.publishedAt === 'string' ? removed.publishedAt : null,
    // A deleted article was visible if it was published; either way its URL
    // and every listing that referenced it must be cleared.
    wasPublic: isPubliclyVisible(removed.workflowStatus),
    isPublic: false,
  }))
}

type SimpleEntity = 'category' | 'tag' | 'author' | 'page' | 'live-blog'

/** Hook factory for collections whose invalidation is just "this thing changed". */
export function revalidateEntity(type: SimpleEntity): CollectionAfterChangeHook {
  return ({ doc, previousDoc, req }) => {
    const current = asDoc(doc)
    const previous = asDoc(previousDoc)
    const locale = localeOf(req.locale)
    const ref = {
      id: current.id,
      slug: typeof current.slug === 'string' ? current.slug : null,
      previousSlug: typeof previous.slug === 'string' ? previous.slug : null,
    }

    const event: RevalidationEvent =
      type === 'category'
        ? { type, locale, category: ref }
        : type === 'tag'
          ? { type, locale, tag: ref }
          : type === 'author'
            ? { type, locale, author: ref }
            : type === 'page'
              ? { type, locale, page: ref }
              : { type, locale, liveBlog: ref }

    schedule(() => event)
  }
}

/** A live-blog entry invalidates its parent blog's page, nothing wider. */
export const revalidateLiveBlogUpdate: CollectionAfterChangeHook = ({ doc, req }) => {
  const entry = asDoc(doc)
  const locale = localeOf(req.locale)
  const liveBlogId = idOf(entry.liveBlog)
  if (liveBlogId === null) return

  schedule(() => ({
    type: 'live-blog-update',
    locale,
    liveBlog: { id: liveBlogId, slug: slugOf(entry.liveBlog) },
  }))
}

export function revalidateGlobal(
  global: 'homepage' | 'header' | 'footer' | 'site-settings' | 'seo-defaults',
): GlobalAfterChangeHook {
  return ({ req }) => {
    schedule(() => ({ type: 'global', locale: localeOf(req.locale), global }))
  }
}
