import { isLocale } from '@dhakalive/config'
import type { NextResponse } from 'next/server'

import { siteFeed } from '../../../../lib/seo/feed-data'
import { feedNotFound, feedResponse } from '../../../../lib/seo/feed-response'

/**
 * Site-wide Atom.
 *
 * A static segment inside `[locale]`, so it wins over the `[section]` route
 * that would otherwise match `atom.xml` as a category slug and 404.
 */
export const revalidate = 300

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string }> },
): Promise<NextResponse> {
  const { locale } = await params
  if (!isLocale(locale)) return feedNotFound()

  return feedResponse(await siteFeed(locale, 'atom'), 'atom')
}
