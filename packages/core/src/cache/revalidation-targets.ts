import { LOCALES, type Locale } from '@dhakalive/config'

import { CacheTag } from './tags.js'

/**
 * Works out what to invalidate when content changes.
 *
 * A pure function, deliberately. Cache invalidation is the part of a publishing
 * system that is hardest to test in place and most damaging when wrong — a
 * missed target serves a stale story, an over-broad one throws away the whole
 * edge cache during peak traffic. Keeping it free of Payload, Next and the
 * network means the rules can be asserted directly.
 *
 * Hooks call this and hand the result to the revalidation service. No hook
 * decides for itself what to purge.
 */

export interface RevalidationTargets {
  /** Next cache tags to revalidate. */
  tags: string[]
  /** Site-relative paths, used for `revalidatePath` and CDN URL purging. */
  paths: string[]
}

interface EntityRef {
  id: string | number
  slug?: string | null
  /** Set when the slug changed, so the old URL is purged too. */
  previousSlug?: string | null
}

export interface ArticleChange {
  type: 'article'
  locale: Locale
  article: EntityRef
  categorySlug?: string | null
  previousCategorySlug?: string | null
  categoryId?: string | number | null
  tagIds?: (string | number)[]
  authorSlugs?: string[]
  authorIds?: (string | number)[]
  publishedAt?: string | null
  /** Whether the article was publicly visible before this change. */
  wasPublic: boolean
  /** Whether it is publicly visible after it. */
  isPublic: boolean
}

export type RevalidationEvent =
  | ArticleChange
  | { type: 'category'; locale: Locale; category: EntityRef }
  | { type: 'tag'; locale: Locale; tag: EntityRef }
  | { type: 'author'; locale: Locale; author: EntityRef }
  | { type: 'page'; locale: Locale; page: EntityRef }
  | { type: 'live-blog'; locale: Locale; liveBlog: EntityRef }
  | { type: 'live-blog-update'; locale: Locale; liveBlog: EntityRef }
  /**
   * A booked placement starting, ending or changing. It has no URL of its own —
   * it appears inside other people's pages — so it invalidates the same
   * site-wide surface a layout change does.
   */
  | { type: 'advertisement'; locale: Locale; advertisement: EntityRef }
  | {
      type: 'global'
      locale: Locale
      global: 'homepage' | 'header' | 'footer' | 'site-settings' | 'seo-defaults'
    }

const EMPTY: RevalidationTargets = { tags: [], paths: [] }

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))]
}

function articleUrl(locale: Locale, categorySlug: string, slug: string): string {
  return `/${locale}/${encodeURIComponent(categorySlug)}/${encodeURIComponent(slug)}`
}

function archiveUrl(locale: Locale, publishedAt: string): string | null {
  const date = new Date(publishedAt)
  if (Number.isNaN(date.getTime())) return null

  // Archives are grouped in the newsroom's timezone, matching the archive route.
  const dhaka = new Date(date.getTime() + 6 * 60 * 60 * 1000)
  const year = dhaka.getUTCFullYear()
  const month = String(dhaka.getUTCMonth() + 1).padStart(2, '0')
  const day = String(dhaka.getUTCDate()).padStart(2, '0')
  return `/${locale}/archive/${year}/${month}/${day}`
}

function articleTargets(event: ArticleChange): RevalidationTargets {
  /**
   * A draft that is still a draft affects nothing public. Purging on every
   * autosave would empty the edge cache continuously while a reporter types.
   */
  if (!event.wasPublic && !event.isPublic) return EMPTY

  const { locale } = event
  const tags = [
    CacheTag.article(locale, event.article.id),
    CacheTag.articleFeed(locale),
    CacheTag.home(locale),
    CacheTag.sitemap(),
    CacheTag.feed(locale),
  ]

  const paths = [`/${locale}`]

  // Both the new and the old URL — a slug or section change leaves the previous
  // address cached and serving a story that has moved.
  const currentSlug = event.article.slug
  if (currentSlug && event.categorySlug) {
    paths.push(articleUrl(locale, event.categorySlug, currentSlug))
  }

  const previousSlug = event.article.previousSlug ?? currentSlug
  const previousCategory = event.previousCategorySlug ?? event.categorySlug
  if (previousSlug && previousCategory) {
    paths.push(articleUrl(locale, previousCategory, previousSlug))
  }

  if (event.categorySlug) paths.push(`/${locale}/${encodeURIComponent(event.categorySlug)}`)
  if (event.previousCategorySlug) {
    paths.push(`/${locale}/${encodeURIComponent(event.previousCategorySlug)}`)
  }

  if (event.categoryId !== null && event.categoryId !== undefined) {
    tags.push(CacheTag.category(locale, event.categoryId))
  }

  for (const tagId of event.tagIds ?? []) tags.push(CacheTag.tag(locale, tagId))
  for (const authorId of event.authorIds ?? []) tags.push(CacheTag.author(locale, authorId))
  for (const authorSlug of event.authorSlugs ?? []) {
    paths.push(`/${locale}/author/${encodeURIComponent(authorSlug)}`)
  }

  if (event.publishedAt) {
    const archive = archiveUrl(locale, event.publishedAt)
    if (archive) paths.push(archive)
  }

  return { tags: unique(tags), paths: unique(paths) }
}

function slugPaths(locale: Locale, prefix: string, ref: EntityRef): string[] {
  const paths: string[] = []
  const base = prefix ? `/${locale}/${prefix}` : `/${locale}`
  if (ref.slug) paths.push(`${base}/${encodeURIComponent(ref.slug)}`)
  if (ref.previousSlug && ref.previousSlug !== ref.slug) {
    paths.push(`${base}/${encodeURIComponent(ref.previousSlug)}`)
  }
  return paths
}

export function computeRevalidationTargets(event: RevalidationEvent): RevalidationTargets {
  switch (event.type) {
    case 'article':
      return articleTargets(event)

    case 'category':
      // A renamed or reordered section changes navigation, which is on every page.
      return {
        tags: unique([
          CacheTag.category(event.locale, event.category.id),
          CacheTag.layout(event.locale),
          CacheTag.home(event.locale),
          CacheTag.sitemap(),
        ]),
        paths: unique([`/${event.locale}`, ...slugPaths(event.locale, '', event.category)]),
      }

    case 'tag':
      return {
        tags: unique([CacheTag.tag(event.locale, event.tag.id), CacheTag.sitemap()]),
        paths: unique(slugPaths(event.locale, 'tag', event.tag)),
      }

    case 'author':
      return {
        tags: unique([CacheTag.author(event.locale, event.author.id), CacheTag.sitemap()]),
        paths: unique(slugPaths(event.locale, 'author', event.author)),
      }

    case 'page':
      return {
        tags: unique([CacheTag.page(event.locale, event.page.id), CacheTag.sitemap()]),
        paths: unique(slugPaths(event.locale, '', event.page)),
      }

    case 'live-blog':
    case 'live-blog-update':
      return {
        tags: unique([
          CacheTag.liveBlog(event.locale, event.liveBlog.id),
          ...(event.type === 'live-blog' ? [CacheTag.sitemap()] : []),
        ]),
        paths: unique(slugPaths(event.locale, 'live', event.liveBlog)),
      }

    case 'advertisement':
      /**
       * Every page that carries a slot. There is no path list for that, so it
       * goes by tag — the same reasoning as a header or footer change, and the
       * reason ad slots are cheap to render but expensive to change.
       */
      return {
        tags: unique([
          CacheTag.layout(event.locale),
          CacheTag.home(event.locale),
          CacheTag.articleFeed(event.locale),
        ]),
        paths: [`/${event.locale}`],
      }

    case 'global': {
      if (event.global === 'homepage') {
        return {
          tags: [CacheTag.home(event.locale)],
          paths: [`/${event.locale}`],
        }
      }

      /**
       * Header, footer, site settings and SEO defaults render on every page.
       * Invalidated by tag rather than by enumerating URLs: the path list would
       * be the entire site, which is neither knowable here nor purgeable in one
       * request.
       */
      return {
        tags: unique([
          CacheTag.layout(event.locale),
          CacheTag.home(event.locale),
          CacheTag.articleFeed(event.locale),
        ]),
        paths: [`/${event.locale}`],
      }
    }
  }
}

/** Merges targets from several events, de-duplicated. */
export function mergeTargets(...targets: RevalidationTargets[]): RevalidationTargets {
  return {
    tags: unique(targets.flatMap((target) => target.tags)),
    paths: unique(targets.flatMap((target) => target.paths)),
  }
}

/** Every locale's home page — used when something global changes. */
export function allLocaleHomes(): RevalidationTargets {
  return {
    tags: LOCALES.map((locale) => CacheTag.home(locale)),
    paths: LOCALES.map((locale) => `/${locale}`),
  }
}
