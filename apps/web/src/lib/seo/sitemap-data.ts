import 'server-only'

import { PUBLIC_LOCALES, type Locale } from '@dhakalive/config'
import { MAX_NEWS_SITEMAP_ENTRIES, MAX_SITEMAP_ENTRIES, type SitemapEntry } from '@dhakalive/core'

import { mediaUrl } from '../media'
import { getPayloadClient } from '../queries/client'
import { getSiteSettings } from '../queries/globals'
import {
  absoluteUrl,
  articlePath,
  authorPath,
  categoryPath,
  homePath,
  pagePath,
  tagPath,
} from '../routes'
import { env } from '../env'
import { isIndexableTag } from './thin-content'

/**
 * The data behind the sitemaps.
 *
 * Kept apart from the routes so the chunking arithmetic — which decides how many
 * article sitemaps the index advertises — is written once and used by both the
 * index and the chunk it points at. Two implementations of "how many pages are
 * there" is how an index comes to reference a sitemap that returns nothing.
 */

/**
 * URLs per article sitemap.
 *
 * Well under the 50,000 limit on purpose. A crawler refetches a whole sitemap
 * when its `lastmod` changes, and on a news site the newest chunk changes
 * constantly — smaller chunks mean that refetch is cheap. The limit is still
 * enforced below in case this is ever raised carelessly.
 */
export const ARTICLES_PER_SITEMAP = Math.min(2_000, MAX_SITEMAP_ENTRIES)

/**
 * Google News only considers articles from the last two days. Publishing older
 * URLs in a news sitemap is a reported error, not a harmless extra.
 */
const NEWS_WINDOW_HOURS = 48

function siteUrl(): string {
  return env().NEXT_PUBLIC_SITE_URL
}

/** Language codes for `news:language` — the language, not the locale. */
const NEWS_LANGUAGE: Record<Locale, string> = { bn: 'bn', en: 'en' }

interface ArticleRow {
  id: number
  slug?: string | null
  headline?: string | null
  publishedAt?: string | null
  updatedAt: string
  primaryCategory?: unknown
  featuredImage?: unknown
}

function categorySlugOf(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const slug = (value as { slug?: unknown }).slug
  return typeof slug === 'string' && slug.length > 0 ? slug : null
}

/**
 * Published articles, newest first.
 *
 * `overrideAccess: false` with no user, like every other public query — the
 * published-only constraint comes from the collection's own access rule rather
 * than being restated here, so a sitemap can never advertise a URL the site
 * would refuse to serve.
 */
async function findArticles(
  locale: Locale,
  options: { limit: number; page?: number; since?: Date },
): Promise<{ docs: ArticleRow[]; totalDocs: number }> {
  const payload = await getPayloadClient()

  const result = await payload.find({
    collection: 'articles',
    locale,
    depth: 1,
    limit: options.limit,
    page: options.page ?? 1,
    sort: '-publishedAt',
    overrideAccess: false,
    where: options.since
      ? { publishedAt: { greater_than: options.since.toISOString() } }
      : undefined,
    select: {
      slug: true,
      headline: true,
      publishedAt: true,
      updatedAt: true,
      primaryCategory: true,
      featuredImage: true,
    },
  })

  return { docs: result.docs, totalDocs: result.totalDocs }
}

export async function countArticleSitemaps(): Promise<number> {
  const { totalDocs } = await findArticles(PUBLIC_LOCALES[0]!, { limit: 1 })
  // Always advertise at least one chunk: an index pointing at nothing looks like
  // a broken site rather than an empty one.
  return Math.max(1, Math.ceil(totalDocs / ARTICLES_PER_SITEMAP))
}

/**
 * One chunk of article URLs, in every locale.
 *
 * Each article appears once per locale with `hreflang` alternates pointing at
 * its translations, which is what tells a search engine the two URLs are the
 * same story rather than duplicates.
 */
export async function articleSitemapEntries(page: number): Promise<SitemapEntry[]> {
  const url = siteUrl()
  const entries: SitemapEntry[] = []

  // Pagination is driven from the default locale so chunk boundaries are stable
  // across locales; a story missing a translation still falls back.
  const byLocale = new Map<Locale, ArticleRow[]>()
  for (const locale of PUBLIC_LOCALES) {
    const { docs } = await findArticles(locale, { limit: ARTICLES_PER_SITEMAP, page })
    byLocale.set(locale, docs)
  }

  for (const locale of PUBLIC_LOCALES) {
    for (const article of byLocale.get(locale) ?? []) {
      const category = categorySlugOf(article.primaryCategory)
      if (!category || !article.slug) continue

      const path = articlePath(locale, category, article.slug)

      const alternates = PUBLIC_LOCALES.flatMap((other) => {
        const match = byLocale.get(other)?.find((entry) => entry.id === article.id)
        const otherCategory = categorySlugOf(match?.primaryCategory)
        if (!match?.slug || !otherCategory) return []
        return [
          {
            hreflang: other,
            href: absoluteUrl(articlePath(other, otherCategory, match.slug), url),
          },
        ]
      })

      const image = mediaUrl(article.featuredImage, ['wide', 'og'])

      entries.push({
        loc: absoluteUrl(path, url),
        lastmod: article.updatedAt,
        changefreq: 'daily',
        alternates,
        images: image ? [image] : [],
      })
    }
  }

  return entries.slice(0, MAX_SITEMAP_ENTRIES)
}

/** Articles published inside the Google News window. */
export async function newsSitemapEntries(): Promise<SitemapEntry[]> {
  const url = siteUrl()
  const since = new Date(Date.now() - NEWS_WINDOW_HOURS * 60 * 60 * 1000)
  const entries: SitemapEntry[] = []

  /**
   * Read from the English locale deliberately. Google matches this string
   * against the publication name registered in Publisher Center, which is one
   * canonical name for the whole site — not something that varies per locale.
   */
  const settings = await getSiteSettings('en')
  const publicationName = settings.siteName ?? 'DhakaLive'

  for (const locale of PUBLIC_LOCALES) {
    const { docs } = await findArticles(locale, { limit: MAX_NEWS_SITEMAP_ENTRIES, since })

    for (const article of docs) {
      const category = categorySlugOf(article.primaryCategory)
      if (!category || !article.slug || !article.headline || !article.publishedAt) continue

      entries.push({
        loc: absoluteUrl(articlePath(locale, category, article.slug), url),
        lastmod: article.updatedAt,
        news: {
          publicationName,
          language: NEWS_LANGUAGE[locale],
          publicationDate: article.publishedAt,
          title: article.headline,
        },
      })
    }
  }

  return entries.slice(0, MAX_NEWS_SITEMAP_ENTRIES)
}

/**
 * Everything that is not an article: home, sections, tags, bylines and standing
 * pages. Small enough to stay one file for the foreseeable life of the site.
 */
/**
 * How many published articles carry each tag, keyed by tag id.
 *
 * Counted in one pass over the articles rather than one query per tag: there
 * are far more tags than articles here — 977 against 395 — so asking the
 * database once per tag would be three times the work for the same answer, on a
 * route a crawler hits regularly.
 *
 * Only the relationship column is selected, so this stays a narrow read even as
 * the archive grows.
 */
async function publishedArticleCountByTag(locale: Locale): Promise<Map<number, number>> {
  const payload = await getPayloadClient()
  const counts = new Map<number, number>()

  const { docs } = await payload.find({
    collection: 'articles',
    locale,
    depth: 0,
    limit: MAX_SITEMAP_ENTRIES,
    pagination: false,
    overrideAccess: false,
    select: { tags: true },
  })

  for (const doc of docs) {
    const tags = (doc as { tags?: unknown }).tags
    if (!Array.isArray(tags)) continue
    for (const tag of tags) {
      // depth: 0 gives ids, but a populated object is harmless to support.
      const id = typeof tag === 'number' ? tag : (tag as { id?: unknown })?.id
      if (typeof id !== 'number') continue
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
  }

  return counts
}

export async function taxonomySitemapEntries(): Promise<SitemapEntry[]> {
  const payload = await getPayloadClient()
  const url = siteUrl()
  const entries: SitemapEntry[] = []

  for (const locale of PUBLIC_LOCALES) {
    entries.push({
      loc: absoluteUrl(homePath(locale), url),
      changefreq: 'hourly',
      priority: 1,
      alternates: PUBLIC_LOCALES.map((other) => ({
        hreflang: other,
        href: absoluteUrl(homePath(other), url),
      })),
    })

    const [categories, tags, authors, pages] = await Promise.all([
      payload.find({
        collection: 'categories',
        locale,
        depth: 0,
        limit: 500,
        overrideAccess: false,
        where: { isActive: { not_equals: false } },
        select: { slug: true, updatedAt: true },
      }),
      payload.find({
        collection: 'tags',
        locale,
        depth: 0,
        limit: 1000,
        overrideAccess: false,
        select: { slug: true, updatedAt: true },
      }),
      payload.find({
        collection: 'authors',
        locale,
        depth: 0,
        limit: 500,
        overrideAccess: false,
        where: { isActive: { not_equals: false } },
        select: { slug: true, updatedAt: true },
      }),
      payload.find({
        collection: 'pages',
        locale,
        depth: 0,
        limit: 200,
        overrideAccess: false,
        select: { slug: true, updatedAt: true },
      }),
    ])

    const push = (
      docs: { slug?: string | null; updatedAt?: string }[],
      build: (slug: string) => string,
      changefreq: SitemapEntry['changefreq'],
      priority: number,
    ): void => {
      for (const doc of docs) {
        if (!doc.slug) continue
        entries.push({
          loc: absoluteUrl(build(doc.slug), url),
          lastmod: doc.updatedAt ?? null,
          changefreq,
          priority,
        })
      }
    }

    push(categories.docs, (slug) => categoryPath(locale, slug), 'hourly', 0.8)

    /**
     * Only tags carrying real coverage are offered to crawlers.
     *
     * Submitting all 977 of them, most listing a single story, is what put 784
     * URLs into "Discovered - currently not indexed" and spent the crawl budget
     * on near-duplicate listings instead of on the articles. The threshold is
     * shared with the tag page itself so a URL is never advertised here and then
     * found to say `noindex` — see lib/seo/thin-content.ts.
     */
    const counts = await publishedArticleCountByTag(locale)
    push(
      tags.docs.filter((tag) => isIndexableTag(counts.get(tag.id) ?? 0)),
      (slug) => tagPath(locale, slug),
      'daily',
      0.5,
    )
    push(authors.docs, (slug) => authorPath(locale, slug), 'weekly', 0.5)
    push(pages.docs, (slug) => pagePath(locale, slug), 'monthly', 0.3)
  }

  return entries.slice(0, MAX_SITEMAP_ENTRIES)
}
