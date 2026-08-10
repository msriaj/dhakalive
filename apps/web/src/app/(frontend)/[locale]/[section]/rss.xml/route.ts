import { isLocale } from '@dhakalive/config'
import type { NextResponse } from 'next/server'

import { categoryFeed } from '../../../../../lib/seo/feed-data'
import { feedNotFound, feedResponse } from '../../../../../lib/seo/feed-response'

/**
 * Per-section RSS.
 *
 * A static segment beside `[slug]`, so it takes precedence over the article
 * route rather than being resolved as a story called "rss.xml".
 *
 * Only categories get a feed. A standing page shares the single-segment space
 * but has no stream of items behind it, so an unknown or non-category slug is a
 * 404 rather than an empty feed a reader would keep polling.
 */
export const revalidate = 300

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; section: string }> },
): Promise<NextResponse> {
  const { locale, section } = await params
  if (!isLocale(locale)) return feedNotFound()

  const feed = await categoryFeed(locale, decodeURIComponent(section), 'rss')
  return feed ? feedResponse(feed, 'rss') : feedNotFound()
}
