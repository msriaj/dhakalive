import { DEFAULT_LOCALE, LOCALES, type Locale } from '@dhakalive/config'

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

export function homePath(locale: Locale): string {
  return `/${locale}`
}

export function articlePath(locale: Locale, categorySlug: string, articleSlug: string): string {
  return `/${locale}/${segment(categorySlug)}/${segment(articleSlug)}`
}

export function categoryPath(locale: Locale, slug: string): string {
  return `/${locale}/${segment(slug)}`
}

export function pagePath(locale: Locale, slug: string): string {
  // Standing pages share the single-segment space with categories; the route
  // resolves a category first, then a page.
  return `/${locale}/${segment(slug)}`
}

export function tagPath(locale: Locale, slug: string): string {
  return `/${locale}/tag/${segment(slug)}`
}

export function authorPath(locale: Locale, slug: string): string {
  return `/${locale}/author/${segment(slug)}`
}

export function liveBlogPath(locale: Locale, slug: string): string {
  return `/${locale}/live/${segment(slug)}`
}

export function searchPath(locale: Locale, query?: string): string {
  const base = `/${locale}/search`
  return query ? `${base}?q=${encodeURIComponent(query)}` : base
}

export function archivePath(locale: Locale, year: number, month?: number, day?: number): string {
  const parts = [String(year)]
  if (month !== undefined) parts.push(String(month).padStart(2, '0'))
  if (day !== undefined) parts.push(String(day).padStart(2, '0'))
  return `/${locale}/archive/${parts.join('/')}`
}

/** Absolute URL for canonicals, Open Graph, feeds and sitemaps. */
export function absoluteUrl(path: string, siteUrl: string): string {
  return new URL(path, siteUrl).toString()
}

/**
 * The same path in every locale, for `hreflang` alternates.
 *
 * Takes a function so callers can supply a per-locale slug — a Bengali article
 * and its English translation do not share one.
 */
export function localeAlternates(
  build: (locale: Locale) => string | null,
  siteUrl: string,
): Record<string, string> {
  const alternates: Record<string, string> = {}

  for (const locale of LOCALES) {
    const path = build(locale)
    if (path) alternates[locale] = absoluteUrl(path, siteUrl)
  }

  const fallback = build(DEFAULT_LOCALE)
  if (fallback) alternates['x-default'] = absoluteUrl(fallback, siteUrl)

  return alternates
}
