/**
 * XML generation for sitemaps and feeds.
 *
 * Hand-built rather than templated, and every value goes through `escapeXml` on
 * the way in. Sitemaps and feeds are the two places where editorial text — a
 * headline containing an ampersand, a Bengali slug, a quotation mark in a
 * summary — is emitted into a strict grammar. A single unescaped `&` makes the
 * whole document unparseable, and the failure is silent: the crawler simply
 * stops seeing the site.
 *
 * Pure string functions, so the escaping rules can be asserted directly.
 */

/**
 * The five XML predefined entities.
 *
 * `>` does not strictly require escaping in character data, and is escaped
 * anyway: the `]]>` sequence is invalid inside content, and a rule that applies
 * everywhere is easier to be sure of than one with an exception.
 */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Removes characters XML 1.0 cannot represent at all.
 *
 * Control characters below 0x20 — other than tab, newline and carriage return —
 * are forbidden outright, not merely in need of escaping. They reach content
 * through copy-paste from PDFs and word processors, and a single one makes the
 * document invalid with no way for a consumer to recover.
 */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\uFFFE\uFFFF]/g

export function sanitiseXmlText(value: string): string {
  return value.replace(INVALID_XML_CHARS, '')
}

/** Escapes and sanitises in one step. Every caller should use this. */
export function xmlText(value: string): string {
  return escapeXml(sanitiseXmlText(value))
}

export interface AlternateLink {
  hreflang: string
  href: string
}

export interface NewsMetadata {
  /** Publication name exactly as registered with Google News. */
  publicationName: string
  /** Two- or three-letter language code — `bn`, `en`. Not a locale. */
  language: string
  publicationDate: string
  title: string
}

export interface SitemapEntry {
  loc: string
  lastmod?: string | null
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never' | null
  /** 0.0–1.0. Omitted rather than defaulted; the default is 0.5 either way. */
  priority?: number | null
  alternates?: readonly AlternateLink[]
  images?: readonly string[]
  news?: NewsMetadata | null
}

/** Google's hard limits. Exceeding either invalidates the whole file. */
export const MAX_SITEMAP_ENTRIES = 50_000
export const MAX_NEWS_SITEMAP_ENTRIES = 1_000

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>'

function isoOrNull(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function renderEntry(entry: SitemapEntry): string {
  const parts = [`<loc>${xmlText(entry.loc)}</loc>`]

  const lastmod = isoOrNull(entry.lastmod)
  if (lastmod) parts.push(`<lastmod>${lastmod}</lastmod>`)
  if (entry.changefreq) parts.push(`<changefreq>${entry.changefreq}</changefreq>`)
  if (typeof entry.priority === 'number') {
    parts.push(`<priority>${entry.priority.toFixed(1)}</priority>`)
  }

  for (const alternate of entry.alternates ?? []) {
    parts.push(
      `<xhtml:link rel="alternate" hreflang="${xmlText(alternate.hreflang)}" href="${xmlText(alternate.href)}"/>`,
    )
  }

  for (const image of entry.images ?? []) {
    parts.push(`<image:image><image:loc>${xmlText(image)}</image:loc></image:image>`)
  }

  if (entry.news) {
    const published = isoOrNull(entry.news.publicationDate)
    parts.push(
      '<news:news>' +
        '<news:publication>' +
        `<news:name>${xmlText(entry.news.publicationName)}</news:name>` +
        `<news:language>${xmlText(entry.news.language)}</news:language>` +
        '</news:publication>' +
        (published ? `<news:publication_date>${published}</news:publication_date>` : '') +
        `<news:title>${xmlText(entry.news.title)}</news:title>` +
        '</news:news>',
    )
  }

  return `<url>${parts.join('')}</url>`
}

export interface UrlsetOptions {
  /** Adds the Google News namespace. Only declare it when it is used. */
  news?: boolean
  images?: boolean
  alternates?: boolean
}

/**
 * A `<urlset>` document.
 *
 * Namespaces are declared only when the corresponding elements are present.
 * Declaring all of them unconditionally costs bytes on every sitemap and — for
 * the news namespace specifically — invites Google to treat an ordinary sitemap
 * as a news sitemap and complain that its entries are too old.
 */
export function urlset(entries: readonly SitemapEntry[], options: UrlsetOptions = {}): string {
  const namespaces = ['xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"']
  if (options.news) namespaces.push('xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"')
  if (options.images) {
    namespaces.push('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"')
  }
  if (options.alternates) namespaces.push('xmlns:xhtml="http://www.w3.org/1999/xhtml"')

  return (
    `${XML_DECLARATION}\n<urlset ${namespaces.join(' ')}>` +
    entries.map(renderEntry).join('') +
    '</urlset>'
  )
}

export interface SitemapIndexEntry {
  loc: string
  lastmod?: string | null
}

export function sitemapIndex(entries: readonly SitemapIndexEntry[]): string {
  const body = entries
    .map((entry) => {
      const lastmod = isoOrNull(entry.lastmod)
      return (
        '<sitemap>' +
        `<loc>${xmlText(entry.loc)}</loc>` +
        (lastmod ? `<lastmod>${lastmod}</lastmod>` : '') +
        '</sitemap>'
      )
    })
    .join('')

  return (
    `${XML_DECLARATION}\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
    body +
    '</sitemapindex>'
  )
}
