import 'server-only'

import { renderAtom, renderRss } from '@dhakalive/core'
import { NextResponse } from 'next/server'

import type { FeedContent } from './feed-data'

/**
 * Serialising a feed into an HTTP response.
 *
 * One place, so the four routes — site and section, RSS and Atom — cannot drift
 * on content type or caching. Feed readers poll aggressively and a wrong
 * `content-type` is the difference between a feed that subscribes and one that
 * downloads.
 */

export type FeedFormat = 'rss' | 'atom'

const CONTENT_TYPE: Record<FeedFormat, string> = {
  // `application/rss+xml` is not registered with IANA but is universally
  // expected; `text/xml` makes several readers offer the file for download.
  rss: 'application/rss+xml; charset=utf-8',
  atom: 'application/atom+xml; charset=utf-8',
}

/**
 * Five minutes, matching the article route's own revalidation window. A feed
 * that is fresher than the pages it links to only means readers arrive before
 * the CDN has the story.
 */
const CACHE_CONTROL = 'public, max-age=300, s-maxage=300, stale-while-revalidate=1800'

export function feedResponse(content: FeedContent, format: FeedFormat): NextResponse {
  const body =
    format === 'rss'
      ? renderRss(content.channel, content.items)
      : renderAtom(content.channel, content.items)

  return new NextResponse(body, {
    headers: {
      'content-type': CONTENT_TYPE[format],
      'cache-control': CACHE_CONTROL,
    },
  })
}

export function feedNotFound(): NextResponse {
  return new NextResponse('Not found', { status: 404, headers: { 'cache-control': 'no-store' } })
}
