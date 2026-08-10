import * as cheerio from 'cheerio'
import type { AnyNode } from 'domhandler'

/**
 * Reads the upstream feed and turns pages of markup into typed records.
 *
 * Everything site-specific is confined to this file. The rest of the service
 * deals in `FeedItem` and `ArticleDetail`, so pointing the ingest at a different
 * source — or at a real syndication feed, which is what this should become if
 * the relationship is ever formalised — is a matter of writing a second adapter
 * rather than touching the pipeline.
 *
 * Scraping is a brittle integration by nature: it depends on markup the upstream
 * site can change without notice and owes us no warning about. Every selector is
 * therefore named once, at the top, and every extraction failure is loud. A
 * silent partial parse would publish an article with no body.
 */

/** Selectors for the listing page. Taken from the rendered card markup. */
const LIST = {
  card: '.news-block-four',
  link: '.content-box h3 a',
  image: '.image img',
  summary: '.text',
} as const

/**
 * Selectors for the article page.
 *
 * `.news-article-text-block` and not its `.text` parent, which is deliberate:
 * the parent also contains the AdSense unit, so selecting it would sweep an
 * `<ins class="adsbygoogle">` and two `<script>` tags into the paragraph list
 * and hand them to the model as though they were reporting.
 *
 * The detail page supplies the body and nothing else this pipeline uses — the
 * section comes from the URL, the timestamp from the listing, and the byline is
 * our own desk. So there are no selectors here for those, rather than guesses
 * that would look confirmed.
 */
const DETAIL = {
  body: '.news-article-text-block',
  /** Removed before reading paragraphs. Ads and scripts are not editorial text. */
  noise: 'script, style, ins, iframe, .fullwidth-add, .ads',
} as const

/**
 * The upstream publishes wall-clock times with no offset — `2026-08-10 19:18:11`
 * in an HTML comment beside the relative "৪ ঘণ্টা আগে" a reader sees. Parsed as
 * Dhaka time, because reading it as UTC would date every story six hours early
 * and quietly reorder the front page.
 */
const SOURCE_UTC_OFFSET = '+06:00'

/** DOM node type for a comment. Compared numerically to avoid depending on
 * `domelementtype`'s enum just to name the value `'comment'`. */
const COMMENT_NODE = 8

export interface FeedItem {
  /** Stable identity at the source. The dedupe key. */
  externalId: string
  url: string
  title: string
  summary: string
  imageUrl: string | null
  publishedAt: string | null
  /** Section slug lifted from the URL path, before any mapping to our taxonomy. */
  sourceCategory: string | null
}

export interface ArticleDetail extends FeedItem {
  /** Paragraphs in document order. The rewrite works from these. */
  paragraphs: string[]
}

export class IngestParseError extends Error {
  constructor(
    message: string,
    readonly url: string,
  ) {
    super(message)
    this.name = 'IngestParseError'
  }
}

/**
 * The trailing numeric segment of a story URL — `…/114337`.
 *
 * Preferred over the whole URL as an identity because the slug segment carries
 * the headline, and a headline that gets corrected upstream would otherwise
 * present as a new story and be ingested twice.
 */
export function externalIdFromUrl(url: string): string | null {
  const match = /\/(\d+)\/?(?:[?#].*)?$/.exec(url)
  return match?.[1] ?? null
}

/**
 * The section slug from a category URL — `/bangla/category/<section>/<slug>/<id>`.
 *
 * Percent-decoded, because the path segments are Bengali and arrive encoded.
 */
export function categoryFromUrl(url: string): string | null {
  const match = /\/category\/([^/]+)\//.exec(url)
  if (!match?.[1]) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    // A malformed escape sequence is not worth failing a story over.
    return match[1]
  }
}

/**
 * Drops the size constraints from the upstream's image proxy.
 *
 * Listing images are served as `/compressed?url=<real>&width=370&height=194`.
 * Keeping `width`/`height` would store a 370px thumbnail as the featured image
 * of every story, which fails at every larger rendition the site asks for.
 *
 * The proxy is kept rather than reaching straight for the `url` value it wraps.
 * That inner asset lives in someone else's object storage, which is free to
 * refuse requests that did not come through their own front door — so the
 * origin URL is the one that looks direct and is the one that breaks.
 *
 * The inner value is re-appended raw rather than through `searchParams`, which
 * would percent-encode it. The proxy is handed the same string it emitted.
 */
export function fullSizeImageUrl(src: string | undefined, baseUrl: string): string | null {
  if (!src) return null

  try {
    const parsed = new URL(src, baseUrl)
    const inner = parsed.searchParams.get('url')
    if (!inner) return parsed.protocol.startsWith('http') ? parsed.toString() : null

    return `${parsed.origin}${parsed.pathname}?url=${inner}`
  } catch {
    return null
  }
}

/**
 * A filename for a stored image, taken from the asset the proxy wraps.
 *
 * Reading the proxy's own path would name every file `compressed`, because that
 * is the endpoint — the real name is in the `url` parameter.
 */
export function imageFilename(url: string, fallback = 'ingested-image'): string {
  try {
    const parsed = new URL(url)
    const inner = parsed.searchParams.get('url')
    const path = inner ? new URL(inner).pathname : parsed.pathname
    const name = path.split('/').pop()
    return name && name.length > 0 ? name : fallback
  } catch {
    return fallback
  }
}

/**
 * Reads the absolute timestamp the template leaves in an HTML comment.
 *
 * The visible timestamp is relative — "৪ ঘণ্টা আগে" — and parsing that would
 * mean reconstructing an absolute time from a rounded Bengali string, against a
 * clock that is not ours. The comment beside it carries the real value.
 */
function publishedAtFromComment<T extends AnyNode>(card: cheerio.Cheerio<T>): string | null {
  let found: string | null = null

  card
    .find('*')
    .addBack()
    .contents()
    .each((_, node) => {
      if (found || node.nodeType !== COMMENT_NODE) return
      const data = (node as { data?: unknown }).data
      const match = /(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(
        typeof data === 'string' ? data : '',
      )
      if (match) found = `${match[1]}T${match[2]}${SOURCE_UTC_OFFSET}`
    })

  return found
}

/** Parses the listing page into feed items, skipping cards that lack an identity. */
export function parseListing(html: string, baseUrl: string): FeedItem[] {
  const $ = cheerio.load(html)
  const items: FeedItem[] = []

  $(LIST.card).each((_, element) => {
    const card = $(element)
    const anchor = card.find(LIST.link).first()

    const href = anchor.attr('href')
    if (!href) return

    const url = new URL(href, baseUrl).toString()
    const externalId = externalIdFromUrl(url)
    // No stable identity means no dedupe, and no dedupe means re-ingesting this
    // story on every sweep for as long as it stays on the page.
    if (!externalId) return

    items.push({
      externalId,
      url,
      title: anchor.text().trim(),
      summary: card.find(LIST.summary).first().text().trim(),
      imageUrl: fullSizeImageUrl(card.find(LIST.image).first().attr('src'), baseUrl),
      publishedAt: publishedAtFromComment(card),
      sourceCategory: categoryFromUrl(url),
    })
  })

  // The same story can appear in more than one block on a listing page.
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.externalId)) return false
    seen.add(item.externalId)
    return true
  })
}

/**
 * Reads the body out of an article page.
 *
 * The listing record is trusted for identity, image, section and timestamp — it
 * is the page the feed is defined by — so this adds paragraphs and nothing else.
 */
export function parseDetail(html: string, item: FeedItem): ArticleDetail {
  const $ = cheerio.load(html)

  const container = $(DETAIL.body).first()
  if (container.length === 0) {
    throw new IngestParseError(`No article body matched "${DETAIL.body}"`, item.url)
  }

  // Mutates the loaded document, not the page: strip the ad and script nodes
  // before reading text so none of it can reach the model as reporting.
  container.find(DETAIL.noise).remove()

  const paragraphs = container
    .find('p')
    .map((_, element) => normaliseText($(element).text()))
    .get()
    .filter((text) => text.length > 0)

  if (paragraphs.length === 0) {
    throw new IngestParseError('Article body contained no paragraphs', item.url)
  }

  return { ...item, paragraphs }
}

/**
 * Collapses whitespace and the non-breaking spaces the source litters through
 * its copy. A `&nbsp;` reaching the model is a token spent on markup, and one
 * reaching the body is a character an editor cannot see but can delete.
 */
function normaliseText(value: string): string {
  // Escaped rather than written literally: a raw U+00A0 in source is invisible
  // in review, and the lint rule that catches it is worth keeping on.
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Fetches a page as markup, failing loudly on a non-200. */
export async function fetchPage(url: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(url, {
    signal,
    headers: {
      // Identify the crawler honestly. An ingest that disguises itself is one
      // the upstream cannot rate-limit, block or contact.
      'user-agent': 'DhakaLiveIngest/0.1 (+https://dhakalive.com)',
      accept: 'text/html,application/xhtml+xml',
    },
  })

  if (!response.ok) {
    throw new IngestParseError(`Upstream returned ${response.status}`, url)
  }

  return response.text()
}
