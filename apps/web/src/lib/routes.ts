import { DEFAULT_LOCALE, PUBLIC_LOCALES, localePrefix, type Locale } from '@dhakalive/config'

/**
 * Every public URL is built here.
 *
 * Centralised so that changing a URL shape is one edit rather than a search
 * through templates, and so the sitemap, feeds, canonical tags and hreflang
 * links cannot drift from what the router actually serves.
 *
 * Slugs may contain Bengali characters. `encodeURIComponent` is applied at the
 * boundary: browsers percent-encode transparently, but a raw Bengali slug in a
 * `Location` header or an XML sitemap is not valid.
 */

function segment(value: string): string {
  return encodeURIComponent(value)
}

/**
 * The default locale is served unprefixed — see `localePrefix`. That makes the
 * prefix an empty string for Bengali, so every builder below concatenates it
 * rather than interpolating `/${locale}`, and the home path needs its own case
 * because an empty prefix is not a URL.
 */
export function homePath(locale: Locale): string {
  return localePrefix(locale) || '/'
}

export function articlePath(locale: Locale, categorySlug: string, articleSlug: string): string {
  return `${localePrefix(locale)}/${segment(categorySlug)}/${segment(articleSlug)}`
}

export function categoryPath(locale: Locale, slug: string): string {
  return `${localePrefix(locale)}/${segment(slug)}`
}

export function pagePath(locale: Locale, slug: string): string {
  // Standing pages share the single-segment space with categories; the route
  // resolves a category first, then a page.
  return `${localePrefix(locale)}/${segment(slug)}`
}

export function tagPath(locale: Locale, slug: string): string {
  return `${localePrefix(locale)}/tag/${segment(slug)}`
}

export function authorPath(locale: Locale, slug: string): string {
  return `${localePrefix(locale)}/author/${segment(slug)}`
}

export function liveBlogPath(locale: Locale, slug: string): string {
  return `${localePrefix(locale)}/live/${segment(slug)}`
}

export function searchPath(locale: Locale, query?: string): string {
  const base = `${localePrefix(locale)}/search`
  return query ? `${base}?q=${encodeURIComponent(query)}` : base
}

export function feedPath(locale: Locale, format: 'rss' | 'atom'): string {
  return `${localePrefix(locale)}/${format}.xml`
}

export function archivePath(locale: Locale, year: number, month?: number, day?: number): string {
  const parts = [String(year)]
  if (month !== undefined) parts.push(String(month).padStart(2, '0'))
  if (day !== undefined) parts.push(String(day).padStart(2, '0'))
  return `${localePrefix(locale)}/archive/${parts.join('/')}`
}

/** Absolute URL for canonicals, Open Graph, feeds and sitemaps. */
export function absoluteUrl(path: string, siteUrl: string): string {
  return new URL(path, siteUrl).toString()
}

/**
 * The same path in every published locale, for `hreflang` alternates.
 *
 * Takes a function so callers can supply a per-locale slug — a Bengali article
 * and its English translation do not share one.
 *
 * Empty while the site publishes a single locale. `hreflang` exists to tell a
 * crawler which of several language versions to show; announcing one version
 * as the alternate of itself says nothing, and `x-default` pointing at the only
 * page there is invites Google to treat the pair as a duplicate.
 */
export function localeAlternates(
  build: (locale: Locale) => string | null,
  siteUrl: string,
): Record<string, string> {
  if (PUBLIC_LOCALES.length < 2) return {}

  const alternates: Record<string, string> = {}

  for (const locale of PUBLIC_LOCALES) {
    const path = build(locale)
    if (path) alternates[locale] = absoluteUrl(path, siteUrl)
  }

  const fallback = build(DEFAULT_LOCALE)
  if (fallback) alternates['x-default'] = absoluteUrl(fallback, siteUrl)

  return alternates
}
