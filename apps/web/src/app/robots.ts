import { DEFAULT_LOCALE, LOCALES } from '@dhakalive/config'
import type { MetadataRoute } from 'next'

import { env } from '../lib/env'
import { getSeoDefaults } from '../lib/queries/globals'

/**
 * Rendered on demand, never at build.
 *
 * This route reads from the database. Prerendering it would make `next build`
 * require a live database, which breaks the Docker image build — and an image
 * that only builds when infrastructure is up cannot be rebuilt in a clean CI
 * runner or during an incident.
 *
 * Caching is not lost: the edge caches it under the Cache-Control policy in
 * lib/cache/cache-policy.ts.
 */
export const dynamic = 'force-dynamic'

/**
 * robots.txt.
 *
 * Generated rather than static, because whether this site may be crawled at all
 * is an editorial setting (`SEO defaults → allow indexing`) that exists so a
 * staging deployment cannot be indexed by accident.
 *
 * `revalidate` is deliberately long. robots.txt is fetched constantly and
 * changes almost never; when it does change — turning indexing on for a new
 * environment — an hour's delay is immaterial next to the risk of every crawl
 * hitting the database.
 */
export const revalidate = 3600

export default async function robots(): Promise<MetadataRoute.Robots> {
  const siteUrl = env().NEXT_PUBLIC_SITE_URL
  const defaults = await getSeoDefaults(DEFAULT_LOCALE)

  if (defaults.allowIndexing === false) {
    /**
     * A blanket disallow, and no sitemap. Both matter: `noindex` on a page is
     * only seen after a crawler fetches it, and a sitemap is an active
     * invitation that is often acted on before any page is read.
     */
    return { rules: [{ userAgent: '*', disallow: '/' }] }
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          // The CMS and its API. Nothing here is public, and crawling it burns
          // request budget on pages that will only ever return a login screen.
          '/admin',
          '/api/',
          // Search result pages are thin and infinitely variable — the canonical
          // example of what not to let into an index. They are `noindex` too;
          // this stops them being fetched at all.
          ...LOCALES.map((locale) => `/${locale}/search`),
        ],
      },
      {
        /**
         * Ad-network crawlers must be able to read pages their creatives appear
         * on, including the ones disallowed above, or the network serves
         * untargeted ads. This is a standard carve-out, not a loophole.
         */
        userAgent: ['Mediapartners-Google', 'AdsBot-Google'],
        allow: '/',
      },
    ],
    sitemap: `${siteUrl.replace(/\/$/, '')}/sitemap.xml`,
    host: siteUrl.replace(/\/$/, ''),
  }
}
