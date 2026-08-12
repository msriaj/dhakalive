/**
 * HTTP cache policy, by route class.
 *
 * Next sends `private, no-store` on any dynamically rendered response, which a
 * CDN correctly refuses to cache. Listing pages read `searchParams` for
 * pagination and are therefore dynamic — without an explicit policy the busiest
 * pages on a news site would miss the edge entirely.
 *
 * Kept out of `next.config.ts` so it can be unit-tested. The rules must stay
 * mutually exclusive: Next applies *every* matching rule, so an overlap emits
 * two `Cache-Control` headers and the result is whatever the proxy decides to
 * believe.
 */

import { unprefixedPathMatcher } from '../routing/locale-routing'

export interface HeaderRule {
  source: string
  headers: { key: string; value: string }[]
}

export const NO_STORE = 'private, no-store, max-age=0, must-revalidate'
/** Sitemaps and feeds: crawler-facing, cheap to serve stale. */
export const CRAWLER_CACHE = 'public, s-maxage=600, stale-while-revalidate=3600, max-age=0'
export const ROBOTS_CACHE = 'public, s-maxage=3600, stale-while-revalidate=86400, max-age=0'
export const HOME_CACHE = 'public, s-maxage=60, stale-while-revalidate=300, max-age=0'
export const PUBLIC_CACHE = 'public, s-maxage=300, stale-while-revalidate=3600, max-age=0'

export function cacheHeaderRules(): HeaderRule[] {
  const noStore = [{ key: 'Cache-Control', value: NO_STORE }]

  return [
    // Authenticated surfaces. Never cached by anything, anywhere.
    { source: '/api/:path*', headers: noStore },
    { source: '/admin/:path*', headers: noStore },

    // Search depends on user input and is thin, infinitely-variable content:
    // neither cached nor indexed.
    {
      source: '/search',
      headers: [...noStore, { key: 'X-Robots-Tag', value: 'noindex, follow' }],
    },

    /**
     * Root-level crawler files. They sit outside the locale prefix, so without
     * their own rules they would fall through to Next's dynamic default of
     * `no-store` and never be cached at the edge — every crawler hit would
     * reach the origin and query the database.
     */
    { source: '/robots.txt', headers: [{ key: 'Cache-Control', value: ROBOTS_CACHE }] },
    { source: '/sitemap.xml', headers: [{ key: 'Cache-Control', value: CRAWLER_CACHE }] },
    { source: '/sitemaps/:path*', headers: [{ key: 'Cache-Control', value: CRAWLER_CACHE }] },

    // Home: shortest window, highest churn.
    { source: '/', headers: [{ key: 'Cache-Control', value: HOME_CACHE }] },

    /**
     * Everything else public — articles, listings, archives, live blogs.
     *
     * Bengali is served unprefixed, so this catch-all sits at the root and has
     * to exclude by hand everything that is not an article: the passthrough
     * list the rewrite uses, plus `search`, which has its own rule above, plus
     * the empty path, which is the home rule's. Next applies *every* matching
     * rule, and two `Cache-Control` headers on one response is whatever the
     * proxy in front decides to believe.
     */
    {
      source: unprefixedPathMatcher(['search$', '$']),
      headers: [{ key: 'Cache-Control', value: PUBLIC_CACHE }],
    },
  ]
}
