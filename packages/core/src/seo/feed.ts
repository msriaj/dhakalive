import { xmlText } from './xml.js'

/**
 * RSS 2.0 and Atom 1.0.
 *
 * Both, because the audience is split and neither is going away: RSS is what
 * most reader applications and aggregators expect, Atom is what several
 * republishing pipelines require, and the same items serialise to either.
 *
 * Summaries only, never full article bodies. A full-text feed is scraped and
 * republished within minutes, which for a newsroom means its own work
 * outranking it — and readers who want the story follow the link, which is what
 * the feed is for.
 */

export interface FeedAuthor {
  name: string
  email?: string | null
  /** Absolute URL of the byline page. */
  uri?: string | null
}

export interface FeedEnclosure {
  url: string
  /** MIME type. RSS requires it, and readers ignore enclosures without one. */
  type: string
  /** Size in bytes. Required by the RSS spec; the element is omitted without it. */
  length?: number | null
}

export interface FeedItem {
  /** Absolute, canonical, and used as the identifier as well as the link. */
  url: string
  title: string
  summary?: string | null
  published?: string | null
  updated?: string | null
  authors?: readonly FeedAuthor[]
  categories?: readonly string[]
  enclosure?: FeedEnclosure | null
}

export interface FeedChannel {
  title: string
  description: string
  /** Absolute URL of the page this feed represents. */
  siteUrl: string
  /** Absolute URL of the feed document itself. */
  feedUrl: string
  /** Language code — `bn`, `en`. */
  language: string
  updated?: string | null
  copyright?: string | null
  /** Channel image. RSS caps this at 144×400; readers rarely honour more. */
  imageUrl?: string | null
}

/** Items per feed. Enough for a reader that polls a few times a day to miss nothing. */
export const MAX_FEED_ITEMS = 50

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>'

function isoOrNull(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/**
 * RFC 822 dates, which RSS requires and Atom forbids.
 *
 * `toUTCString` produces exactly the RFC 1123 form RSS readers expect
 * (`Sun, 10 Aug 2026 09:17:45 GMT`). Formatting this by hand with `Intl` would
 * localise the month name and break every parser.
 */
function rfc822(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toUTCString()
}

function latest(channel: FeedChannel, items: readonly FeedItem[]): string {
  const explicit = isoOrNull(channel.updated)
  if (explicit) return explicit

  const timestamps = items
    .map((item) => isoOrNull(item.updated ?? item.published))
    .filter((value): value is string => value !== null)
    .sort()

  // An empty feed still needs a timestamp; conditional requests depend on it.
  return timestamps[timestamps.length - 1] ?? new Date(0).toISOString()
}

export function renderRss(channel: FeedChannel, items: readonly FeedItem[]): string {
  const capped = items.slice(0, MAX_FEED_ITEMS)

  const renderItem = (item: FeedItem): string => {
    const parts = [
      `<title>${xmlText(item.title)}</title>`,
      `<link>${xmlText(item.url)}</link>`,
      // `isPermaLink="true"` says the guid is a URL that resolves. Readers use
      // the guid, not the link, to decide whether an item has been seen before.
      `<guid isPermaLink="true">${xmlText(item.url)}</guid>`,
    ]

    const published = rfc822(item.published)
    if (published) parts.push(`<pubDate>${published}</pubDate>`)

    if (item.summary) parts.push(`<description>${xmlText(item.summary)}</description>`)

    for (const author of item.authors ?? []) {
      // `dc:creator` rather than RSS's own `author`, which requires an email
      // address — publishing a journalist's address in a public feed is not
      // something a byline should imply.
      parts.push(`<dc:creator>${xmlText(author.name)}</dc:creator>`)
    }

    for (const category of item.categories ?? []) {
      parts.push(`<category>${xmlText(category)}</category>`)
    }

    if (item.enclosure && typeof item.enclosure.length === 'number') {
      parts.push(
        `<enclosure url="${xmlText(item.enclosure.url)}" type="${xmlText(item.enclosure.type)}" length="${item.enclosure.length}"/>`,
      )
    }

    return `<item>${parts.join('')}</item>`
  }

  const header = [
    `<title>${xmlText(channel.title)}</title>`,
    `<link>${xmlText(channel.siteUrl)}</link>`,
    `<description>${xmlText(channel.description)}</description>`,
    `<language>${xmlText(channel.language)}</language>`,
    `<lastBuildDate>${rfc822(latest(channel, capped)) ?? ''}</lastBuildDate>`,
    `<atom:link href="${xmlText(channel.feedUrl)}" rel="self" type="application/rss+xml"/>`,
  ]

  if (channel.copyright) header.push(`<copyright>${xmlText(channel.copyright)}</copyright>`)
  if (channel.imageUrl) {
    header.push(
      '<image>' +
        `<url>${xmlText(channel.imageUrl)}</url>` +
        `<title>${xmlText(channel.title)}</title>` +
        `<link>${xmlText(channel.siteUrl)}</link>` +
        '</image>',
    )
  }

  return (
    `${XML_DECLARATION}\n` +
    '<rss version="2.0" ' +
    'xmlns:atom="http://www.w3.org/2005/Atom" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<channel>' +
    header.join('') +
    capped.map(renderItem).join('') +
    '</channel></rss>'
  )
}

export function renderAtom(channel: FeedChannel, items: readonly FeedItem[]): string {
  const capped = items.slice(0, MAX_FEED_ITEMS)

  const renderEntry = (item: FeedItem): string => {
    const parts = [
      `<id>${xmlText(item.url)}</id>`,
      `<title>${xmlText(item.title)}</title>`,
      `<link rel="alternate" type="text/html" href="${xmlText(item.url)}"/>`,
      // `updated` is mandatory in Atom, unlike RSS. Falling back to the
      // publication date is better than omitting a required element.
      `<updated>${isoOrNull(item.updated ?? item.published) ?? new Date(0).toISOString()}</updated>`,
    ]

    const published = isoOrNull(item.published)
    if (published) parts.push(`<published>${published}</published>`)

    if (item.summary) parts.push(`<summary type="text">${xmlText(item.summary)}</summary>`)

    for (const author of item.authors ?? []) {
      parts.push(
        '<author>' +
          `<name>${xmlText(author.name)}</name>` +
          (author.uri ? `<uri>${xmlText(author.uri)}</uri>` : '') +
          '</author>',
      )
    }

    for (const category of item.categories ?? []) {
      parts.push(`<category term="${xmlText(category)}"/>`)
    }

    if (item.enclosure) {
      parts.push(
        `<link rel="enclosure" type="${xmlText(item.enclosure.type)}" href="${xmlText(item.enclosure.url)}"${
          typeof item.enclosure.length === 'number' ? ` length="${item.enclosure.length}"` : ''
        }/>`,
      )
    }

    return `<entry>${parts.join('')}</entry>`
  }

  const header = [
    // The feed's own URL as its id. A tag: URI would be more orthodox, but it
    // has to stay stable forever and a canonical URL already is.
    `<id>${xmlText(channel.feedUrl)}</id>`,
    `<title>${xmlText(channel.title)}</title>`,
    `<subtitle>${xmlText(channel.description)}</subtitle>`,
    `<updated>${latest(channel, capped)}</updated>`,
    `<link rel="self" type="application/atom+xml" href="${xmlText(channel.feedUrl)}"/>`,
    `<link rel="alternate" type="text/html" href="${xmlText(channel.siteUrl)}"/>`,
  ]

  if (channel.copyright) header.push(`<rights>${xmlText(channel.copyright)}</rights>`)
  if (channel.imageUrl) header.push(`<logo>${xmlText(channel.imageUrl)}</logo>`)

  return (
    `${XML_DECLARATION}\n` +
    `<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${xmlText(channel.language)}">` +
    header.join('') +
    capped.map(renderEntry).join('') +
    '</feed>'
  )
}
