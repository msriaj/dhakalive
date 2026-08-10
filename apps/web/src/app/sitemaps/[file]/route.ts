import { DEFAULT_LOCALE } from '@dhakalive/config'
import { urlset } from '@dhakalive/core'
import { getLogger } from '@dhakalive/observability'
import { NextResponse } from 'next/server'

import { getSeoDefaults } from '../../../lib/queries/globals'
import {
  articleSitemapEntries,
  countArticleSitemaps,
  newsSitemapEntries,
  taxonomySitemapEntries,
} from '../../../lib/seo/sitemap-data'
import { SITEMAP_HEADERS } from '../../sitemap.xml/route'

/**
 * Every child sitemap, behind one route.
 *
 * A single dynamic segment rather than four route files: the alternative in the
 * App Router is either a folder per sitemap or URLs without a `.xml` extension,
 * and the extension is worth keeping — it is what makes these recognisable in a
 * server log and in Search Console.
 *
 * The filename is parsed rather than matched loosely, so `/sitemaps/anything`
 * is a 404 instead of an empty document that looks like a real but empty
 * sitemap.
 */
export const revalidate = 600

const ARTICLES_PATTERN = /^articles-(\d+)\.xml$/

function notFound(): NextResponse {
  return new NextResponse('Not found', { status: 404, headers: { 'cache-control': 'no-store' } })
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
): Promise<NextResponse> {
  const { file } = await params

  // Same rule as the index: a site that asked not to be indexed publishes no
  // sitemaps at all.
  const defaults = await getSeoDefaults(DEFAULT_LOCALE)
  if (defaults.allowIndexing === false) return notFound()

  try {
    if (file === 'news.xml') {
      return new NextResponse(await newsSitemapEntries().then((e) => urlset(e, { news: true })), {
        headers: SITEMAP_HEADERS,
      })
    }

    if (file === 'taxonomy.xml') {
      const entries = await taxonomySitemapEntries()
      return new NextResponse(urlset(entries, { alternates: true }), { headers: SITEMAP_HEADERS })
    }

    const match = ARTICLES_PATTERN.exec(file)
    if (!match?.[1]) return notFound()

    const page = Number.parseInt(match[1], 10)
    if (!Number.isFinite(page) || page < 1) return notFound()

    /**
     * Out-of-range chunks 404 rather than returning an empty sitemap. An empty
     * document is a valid sitemap, so a crawler would keep the URL and refetch
     * it indefinitely; a 404 makes it drop the URL, which is what should happen
     * when the archive shrinks.
     */
    if (page > (await countArticleSitemaps())) return notFound()

    const entries = await articleSitemapEntries(page)
    return new NextResponse(urlset(entries, { alternates: true, images: true }), {
      headers: SITEMAP_HEADERS,
    })
  } catch (error) {
    getLogger().error({ err: error, file }, 'Sitemap generation failed')
    return new NextResponse(urlset([]), { headers: SITEMAP_HEADERS })
  }
}
