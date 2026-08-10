import 'server-only'

import type { Locale } from '@dhakalive/config'
import { MAX_FEED_ITEMS, type FeedChannel, type FeedItem } from '@dhakalive/core'

import type { Media } from '../../payload-types'
import { getArticlesByCategory, getLatestArticles } from '../queries/articles'
import { getSeoDefaults, getSiteSettings } from '../queries/globals'
import { getCategoryBySlug } from '../queries/taxonomy'
import { mediaUrl } from '../media'
import { absoluteUrl, articlePath, categoryPath, homePath } from '../routes'
import { env } from '../env'

/**
 * Turns articles into feed items.
 *
 * Shared by the RSS and Atom routes so a story is described identically in
 * both. The two formats differ in serialisation, not in what they say, and
 * building the item list twice is how they come to disagree.
 */

function siteUrl(): string {
  return env().NEXT_PUBLIC_SITE_URL
}

function categorySlugOf(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const slug = (value as { slug?: unknown }).slug
  return typeof slug === 'string' && slug.length > 0 ? slug : null
}

function categoryTitleOf(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const title = (value as { title?: unknown }).title
  return typeof title === 'string' && title.length > 0 ? title : null
}

function authorNames(value: unknown): { name: string; uri?: string | null }[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const author = entry as { displayName?: unknown }
    return typeof author.displayName === 'string' && author.displayName.length > 0
      ? [{ name: author.displayName }]
      : []
  })
}

/**
 * The featured image as an enclosure.
 *
 * RSS requires a byte length, and Payload records `filesize` only for the
 * original upload — not for generated sizes. So the enclosure points at the
 * original: a reader that shows it gets a larger file than necessary, which is
 * better than an enclosure the spec says to ignore.
 */
function enclosureOf(value: unknown): FeedItem['enclosure'] {
  if (!value || typeof value !== 'object') return null
  const media = value as Media

  const url = mediaUrl(value)
  if (!url || typeof media.mimeType !== 'string') return null

  return {
    url,
    type: media.mimeType,
    length: typeof media.filesize === 'number' ? media.filesize : null,
  }
}

interface ArticleLike {
  slug?: string | null
  headline?: string | null
  summary?: string | null
  publishedAt?: string | null
  updatedAt?: string
  primaryCategory?: unknown
  authors?: unknown
  featuredImage?: unknown
}

function toFeedItem(article: ArticleLike, locale: Locale): FeedItem | null {
  const category = categorySlugOf(article.primaryCategory)
  if (!category || !article.slug || !article.headline) return null

  const categoryTitle = categoryTitleOf(article.primaryCategory)

  return {
    url: absoluteUrl(articlePath(locale, category, article.slug), siteUrl()),
    title: article.headline,
    summary: article.summary ?? null,
    published: article.publishedAt ?? null,
    updated: article.updatedAt ?? article.publishedAt ?? null,
    authors: authorNames(article.authors),
    categories: categoryTitle ? [categoryTitle] : [],
    enclosure: enclosureOf(article.featuredImage),
  }
}

export interface FeedContent {
  channel: FeedChannel
  items: FeedItem[]
}

async function channelFor(
  locale: Locale,
  options: { path: string; feedPath: string; title: string; description: string },
): Promise<FeedChannel> {
  const url = siteUrl()
  const [settings, defaults] = await Promise.all([getSiteSettings(locale), getSeoDefaults(locale)])

  return {
    title: options.title,
    description: options.description,
    siteUrl: absoluteUrl(options.path, url),
    feedUrl: absoluteUrl(options.feedPath, url),
    language: locale,
    copyright: settings.siteName ? `© ${new Date().getUTCFullYear()} ${settings.siteName}` : null,
    imageUrl: mediaUrl(settings.logo ?? defaults.defaultImage, ['og', 'card']),
  }
}

/** The whole publication, newest first. */
export async function siteFeed(locale: Locale, format: 'rss' | 'atom'): Promise<FeedContent> {
  const [settings, defaults, articles] = await Promise.all([
    getSiteSettings(locale),
    getSeoDefaults(locale),
    getLatestArticles({ locale, limit: MAX_FEED_ITEMS }),
  ])

  const channel = await channelFor(locale, {
    path: homePath(locale),
    feedPath: `${homePath(locale)}/${format}.xml`,
    title: settings.siteName ?? 'DhakaLive',
    description: settings.tagline ?? defaults.defaultDescription ?? '',
  })

  return {
    channel,
    items: articles.docs
      .map((article) => toFeedItem(article, locale))
      .filter((item): item is FeedItem => item !== null),
  }
}

/** One section. Returns null when the slug is not a category, so the route 404s. */
export async function categoryFeed(
  locale: Locale,
  slug: string,
  format: 'rss' | 'atom',
): Promise<FeedContent | null> {
  const category = await getCategoryBySlug(slug, locale)
  if (!category) return null

  const [settings, articles] = await Promise.all([
    getSiteSettings(locale),
    getArticlesByCategory(category.id, { locale, limit: MAX_FEED_ITEMS }),
  ])

  const siteName = settings.siteName ?? 'DhakaLive'

  const channel = await channelFor(locale, {
    path: categoryPath(locale, slug),
    feedPath: `${categoryPath(locale, slug)}/${format}.xml`,
    title: `${category.title ?? slug} — ${siteName}`,
    description: category.description ?? `${category.title ?? slug} — ${siteName}`,
  })

  return {
    channel,
    items: articles.docs
      .map((article) => toFeedItem(article, locale))
      .filter((item): item is FeedItem => item !== null),
  }
}
