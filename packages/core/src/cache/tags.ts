import type { Locale } from '@dhakalive/config'

/**
 * Cache tag vocabulary.
 *
 * Tags are the unit of invalidation everywhere: Next's `revalidateTag`, and —
 * on Cloudflare Enterprise — edge cache-tag purge. Built through these helpers
 * rather than by hand so a page and the code that invalidates it cannot drift
 * apart by a typo.
 */

export const CacheTag = {
  /** Everything rendered in a given locale. The blunt instrument. */
  locale: (locale: Locale) => `locale:${locale}`,

  /** The shared chrome — header, footer, site settings. Changing it affects every page. */
  layout: (locale: Locale) => `layout:${locale}`,

  home: (locale: Locale) => `home:${locale}`,

  article: (locale: Locale, id: string | number) => `article:${locale}:${id}`,
  category: (locale: Locale, id: string | number) => `category:${locale}:${id}`,
  tag: (locale: Locale, id: string | number) => `tag:${locale}:${id}`,
  author: (locale: Locale, id: string | number) => `author:${locale}:${id}`,
  liveBlog: (locale: Locale, id: string | number) => `live-blog:${locale}:${id}`,
  page: (locale: Locale, id: string | number) => `page:${locale}:${id}`,

  /** Listings that must change whenever any article is published or pulled. */
  articleFeed: (locale: Locale) => `article-feed:${locale}`,

  sitemap: () => 'sitemap',
  feed: (locale: Locale) => `feed:${locale}`,
} as const
