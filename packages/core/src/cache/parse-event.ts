import { isLocale } from '@dhakalive/config'

import type { ArticleChange, RevalidationEvent } from './revalidation-targets.js'

/**
 * Validates a revalidation event that arrived over the wire.
 *
 * The worker cannot call `revalidatePath` — it is not a Next process — so it
 * asks the web app to, over HTTP. That makes `RevalidationEvent` an input from
 * outside the process, and it has to be treated like one.
 *
 * What this deliberately does *not* accept is a list of paths. The endpoint
 * takes a description of what changed and derives the targets with the same
 * pure function every in-process caller uses, so a caller who somehow obtains
 * the shared secret still cannot ask the site to purge arbitrary URLs, and
 * cannot invent a purge set that differs from what a real edit would produce.
 *
 * Returns `null` rather than throwing: the caller is an HTTP handler that has to
 * answer with a status code either way.
 */

const GLOBALS = ['homepage', 'header', 'footer', 'site-settings', 'seo-defaults'] as const

type GlobalName = (typeof GLOBALS)[number]

function isGlobalName(value: unknown): value is GlobalName {
  return typeof value === 'string' && (GLOBALS as readonly string[]).includes(value)
}

function isId(value: unknown): value is string | number {
  if (typeof value === 'number') return Number.isFinite(value)
  return typeof value === 'string' && value.length > 0 && value.length <= 64
}

/** Slugs may be Bengali, so only length and type are checked, never a charset. */
function optionalSlug(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string') return undefined
  return value.length <= 512 ? value : undefined
}

interface EntityRef {
  id: string | number
  slug?: string | null
  previousSlug?: string | null
}

function parseRef(value: unknown): EntityRef | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as { id?: unknown; slug?: unknown; previousSlug?: unknown }
  if (!isId(candidate.id)) return null

  return {
    id: candidate.id,
    slug: optionalSlug(candidate.slug) ?? null,
    previousSlug: optionalSlug(candidate.previousSlug) ?? null,
  }
}

/** Caps list lengths so one request cannot expand into an unbounded purge set. */
const MAX_LIST = 100

function parseIdList(value: unknown): (string | number)[] {
  if (!Array.isArray(value)) return []
  return value.filter(isId).slice(0, MAX_LIST)
}

function parseSlugList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry): entry is string => typeof entry === 'string' && entry.length <= 512)
    .slice(0, MAX_LIST)
}

function parseArticle(candidate: Record<string, unknown>, locale: string): ArticleChange | null {
  if (!isLocale(locale)) return null

  const article = parseRef(candidate.article)
  if (!article) return null

  return {
    type: 'article',
    locale,
    article,
    categorySlug: optionalSlug(candidate.categorySlug) ?? null,
    previousCategorySlug: optionalSlug(candidate.previousCategorySlug) ?? null,
    categoryId: isId(candidate.categoryId) ? candidate.categoryId : null,
    tagIds: parseIdList(candidate.tagIds),
    authorIds: parseIdList(candidate.authorIds),
    authorSlugs: parseSlugList(candidate.authorSlugs),
    publishedAt: typeof candidate.publishedAt === 'string' ? candidate.publishedAt : null,
    // Both default to false: an event that fails to say whether the article was
    // or is public describes no public change, and purges nothing.
    wasPublic: candidate.wasPublic === true,
    isPublic: candidate.isPublic === true,
  }
}

export function parseRevalidationEvent(value: unknown): RevalidationEvent | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>

  const locale = candidate.locale
  if (!isLocale(locale)) return null

  switch (candidate.type) {
    case 'article':
      return parseArticle(candidate, locale)

    case 'category': {
      const category = parseRef(candidate.category)
      return category ? { type: 'category', locale, category } : null
    }

    case 'tag': {
      const tag = parseRef(candidate.tag)
      return tag ? { type: 'tag', locale, tag } : null
    }

    case 'author': {
      const author = parseRef(candidate.author)
      return author ? { type: 'author', locale, author } : null
    }

    case 'page': {
      const page = parseRef(candidate.page)
      return page ? { type: 'page', locale, page } : null
    }

    case 'live-blog':
    case 'live-blog-update': {
      const liveBlog = parseRef(candidate.liveBlog)
      return liveBlog ? { type: candidate.type, locale, liveBlog } : null
    }

    case 'global':
      return isGlobalName(candidate.global)
        ? { type: 'global', locale, global: candidate.global }
        : null

    default:
      return null
  }
}
