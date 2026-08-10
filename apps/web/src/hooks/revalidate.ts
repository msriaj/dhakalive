import { DEFAULT_LOCALE, isLocale, type Locale } from '@dhakalive/config'
import { isPubliclyVisible, type RevalidationEvent } from '@dhakalive/core'
import { getLogger } from '@dhakalive/observability'
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  GlobalAfterChangeHook,
  PayloadRequest,
} from 'payload'

import { resolveCategorySlug } from './relationships'

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
 * Invalidates the caches a change affects, from wherever the change happened.
 *
 * Two paths, and which one is taken is not a preference — it is a constraint.
 *
 * **Inside a Next request** (an editor saving in the admin UI) the work is
 * deferred with `after()` and runs once the response is sent. An editor pressing
 * Publish must not wait on the Cloudflare API; a slow CDN would present as a
 * hanging save.
 *
 * **Outside one** (the scheduled-publication job, the CLI, a seed) the work is
 * queued instead. `revalidatePath` throws when called outside a request scope,
 * and it used to be called anyway: the throw was caught, the origin kept serving
 * the previous page, and the CDN purge that did succeed made it worse by
 * refetching that stale page and caching it. The `revalidate` job posts the
 * change to `/api/revalidate`, which performs it inside a real request — the
 * only place `revalidatePath` works.
 *
 * Awaited by its callers, so the queue insert joins the request's transaction:
 * a save that rolls back takes its revalidation with it.
 */
async function schedule(req: PayloadRequest, buildEvent: () => RevalidationEvent): Promise<void> {
  /**
   * Bulk writers — the seed, imports, migrations — opt out through
   * `req.context`. A run that touches hundreds of documents would otherwise fan
   * out to thousands of purges for content that is not live, and the CDN would
   * rate-limit long before the run finished.
   */
  if (req.context?.disableRevalidation === true) return

  const event = buildEvent()

  const runInline = async (): Promise<void> => {
    const { revalidateFor } = await import('../lib/cache/revalidation-service')
    await revalidateFor(event)
  }

  const fail = (error: unknown): void => {
    // Never rethrow: the content is already saved, and a failed purge is a
    // stale page rather than a lost story.
    getLogger().error({ err: error }, 'Revalidation failed')
  }

  /**
   * `after()` throws outside a request scope, and in a non-Next process the
   * import itself fails. Either way the answer is the same, so both are caught
   * together and treated as "not in a request".
   */
  try {
    const { after } = await import('next/server')
    after(() => runInline().catch(fail))
    return
  } catch {
    // Fall through to the queue.
  }

  const { enqueue } = await import('../jobs/enqueue')
  const { QUEUE } = await import('../jobs/queues')

  const queued = await enqueue({
    payload: req.payload,
    task: 'revalidate',
    input: { event },
    queue: QUEUE.content,
    req,
  })

  /**
   * Last resort. If the job could not be queued, run what can still be run from
   * here: `revalidatePath` will fail, but the CDN purge does not need a request
   * scope, and a purged edge with a stale origin is bounded by the route's own
   * revalidate window — whereas doing nothing is not bounded at all.
   */
  if (!queued) await runInline().catch(fail)
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
export const revalidateArticle: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  const current = asDoc(doc)
  const previous = asDoc(previousDoc)

  /**
   * The previous category is resolved rather than read directly. Payload
   * populates `doc` but leaves `previousDoc` holding a bare id, so
   * `previous.primaryCategory.slug` is always undefined — which meant a story
   * moved between sections never purged the section it left, and that listing
   * kept showing it until its own revalidate window expired.
   */
  const event: RevalidationEvent = {
    type: 'article',
    locale: localeOf(req.locale),
    article: {
      id: current.id,
      slug: typeof current.slug === 'string' ? current.slug : null,
      previousSlug: typeof previous.slug === 'string' ? previous.slug : null,
    },
    categorySlug: await resolveCategorySlug(req, current.primaryCategory),
    previousCategorySlug: await resolveCategorySlug(
      req,
      previous.primaryCategory,
      current.primaryCategory,
    ),
    categoryId: idOf(current.primaryCategory),
    tagIds: idsOf(current.tags),
    authorIds: idsOf(current.authors),
    authorSlugs: slugsOf(current.authors),
    publishedAt: typeof current.publishedAt === 'string' ? current.publishedAt : null,
    wasPublic: isPubliclyVisible(previous.workflowStatus),
    isPublic: isPubliclyVisible(current.workflowStatus),
  }

  await schedule(req, () => event)
}

export const revalidateArticleDeletion: CollectionAfterDeleteHook = async ({ doc, req }) => {
  const removed = asDoc(doc)

  await schedule(req, () => ({
    type: 'article',
    locale: localeOf(req.locale),
    article: { id: removed.id, slug: typeof removed.slug === 'string' ? removed.slug : null },
    categorySlug: slugOf(removed.primaryCategory),
    // `afterDelete` hands over the fully populated document, so the slug is
    // present here without a lookup.
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
  return async ({ doc, previousDoc, req }) => {
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

    await schedule(req, () => event)
  }
}

/** A live-blog entry invalidates its parent blog's page, nothing wider. */
export const revalidateLiveBlogUpdate: CollectionAfterChangeHook = async ({ doc, req }) => {
  const entry = asDoc(doc)
  const locale = localeOf(req.locale)
  const liveBlogId = idOf(entry.liveBlog)
  if (liveBlogId === null) return

  await schedule(req, () => ({
    type: 'live-blog-update',
    locale,
    liveBlog: { id: liveBlogId, slug: slugOf(entry.liveBlog) },
  }))
}

export function revalidateGlobal(
  global: 'homepage' | 'header' | 'footer' | 'site-settings' | 'seo-defaults',
): GlobalAfterChangeHook {
  return async ({ req }) => {
    await schedule(req, () => ({ type: 'global', locale: localeOf(req.locale), global }))
  }
}
