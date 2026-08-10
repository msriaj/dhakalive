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

export interface HeaderRule {
  source: string
  headers: { key: string; value: string }[]
}

export const NO_STORE = 'private, no-store, max-age=0, must-revalidate'
export const HOME_CACHE = 'public, s-maxage=60, stale-while-revalidate=300, max-age=0'
export const PUBLIC_CACHE = 'public, s-maxage=300, stale-while-revalidate=3600, max-age=0'

/** Locales, inlined as a route-matcher alternation. */
const LOCALE_MATCH = ':locale(bn|en)'

export function cacheHeaderRules(): HeaderRule[] {
  const noStore = [{ key: 'Cache-Control', value: NO_STORE }]

  return [
    // Authenticated surfaces. Never cached by anything, anywhere.
    { source: '/api/:path*', headers: noStore },
    { source: '/admin/:path*', headers: noStore },

    // Search depends on user input and is thin, infinitely-variable content:
    // neither cached nor indexed.
    {
      source: `/${LOCALE_MATCH}/search`,
      headers: [...noStore, { key: 'X-Robots-Tag', value: 'noindex, follow' }],
    },

    // Home: shortest window, highest churn.
    { source: `/${LOCALE_MATCH}`, headers: [{ key: 'Cache-Control', value: HOME_CACHE }] },

    // Everything else public — articles, listings, archives, live blogs. The
    // negative lookahead keeps this from overlapping the search rule above.
    {
      source: `/${LOCALE_MATCH}/:path((?!search$).*)`,
      headers: [{ key: 'Cache-Control', value: PUBLIC_CACHE }],
    },
  ]
}
