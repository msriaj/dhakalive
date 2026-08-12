import { DEFAULT_LOCALE, LOCALES } from '@dhakalive/config'

/**
 * Serving the default locale without a URL prefix.
 *
 * The route tree is still `app/(frontend)/[locale]/…`, because English is
 * unpublished rather than deleted and bringing it back should not be a
 * refactor. What changes is only the URL the reader sees:
 *
 *   - `/রাজনীতি`     is rewritten to `/bn/রাজনীতি` internally
 *   - `/bn/রাজনীতি`  redirects to `/রাজনীতি`, permanently
 *   - `/en/…`         redirects to the Bengali equivalent while English is off
 *
 * Kept out of `next.config.ts` so the matching can be unit-tested. Getting the
 * exclusion list wrong here does not fail a build — it silently rewrites
 * `/_next/static/…` into a 404 and takes the stylesheets with it.
 */

export interface RewriteRule {
  source: string
  destination: string
}

/**
 * `permanent` is required rather than optional: Next's own type demands either
 * it or an explicit `statusCode`, and leaving it optional here would let a
 * redirect default to temporary by omission.
 */
export interface RedirectRule extends RewriteRule {
  permanent: boolean
}

/**
 * Paths that must reach the filesystem untouched.
 *
 * The rewrite runs in `beforeFiles`, ahead of static files and route matching,
 * which it has to: `[locale]` is a dynamic segment at the root, so `/রাজনীতি`
 * already matches `/[locale]` and would render a 404 for an unknown locale
 * before any later rewrite could fire. The cost of running first is that
 * nothing is excluded automatically and this list is load-bearing.
 *
 * Each entry matches a whole segment — `api/` and `api$`, never a bare `api` —
 * so `/apiary` is a story slug and not an API call.
 */
export const PASSTHROUGH_PATTERNS: readonly string[] = [
  '_next/',
  'api/',
  'api$',
  'admin/',
  'admin$',
  'sitemaps/',
  'sitemap\\.xml$',
  'robots\\.txt$',
  'icon\\.svg$',
  'favicon\\.ico$',
  'fonts/',
  // The locale-prefixed forms redirect rather than rewrite; excluding them
  // keeps a request that somehow arrives here from rewriting to `/bn/bn/…`.
  ...LOCALES.flatMap((locale) => [`${locale}/`, `${locale}$`]),
]

/** The `[locale]` segment every unprefixed URL is served from. */
const UNPREFIXED_TARGET = `/${DEFAULT_LOCALE}`

/**
 * A single-segment matcher that skips the passthrough list.
 *
 * Shared with the cache policy, which has to exclude exactly the same paths
 * from its catch-all public rule: a `Cache-Control` header applied to
 * `/_next/static/…` would override the immutable one Next sets there. Two
 * copies of this list would drift, and the drift would be invisible until an
 * asset started being re-fetched on every page view.
 */
export function unprefixedPathMatcher(alsoExclude: readonly string[] = []): string {
  return `/:path((?!${[...PASSTHROUGH_PATTERNS, ...alsoExclude].join('|')}).*)`
}

export function localeRewrites(): RewriteRule[] {
  return [{ source: unprefixedPathMatcher(), destination: `${UNPREFIXED_TARGET}/:path` }]
}

/**
 * The internal route path a public URL is actually served from.
 *
 * The rewrite means the two are no longer the same string, and the difference
 * matters to exactly one caller. Next keys its route cache by the *resolved*
 * pathname — `/bn/রাজনীতি`, the route that rendered — while Cloudflare keys its
 * cache by the URL the reader asked for, `/রাজনীতি`. So `revalidatePath` needs
 * this form and the CDN purge needs the public one. Passing the public path to
 * `revalidatePath` fails silently: it clears an entry that was never written,
 * reports success, and leaves the corrected story cached until its window
 * expires on its own.
 *
 * Locales that keep a prefix are already their own route and pass through.
 */
export function toRoutePath(publicPath: string): string {
  const prefixed = LOCALES.some(
    (locale) => publicPath === `/${locale}` || publicPath.startsWith(`/${locale}/`),
  )
  if (prefixed) return publicPath

  return publicPath === '/' ? UNPREFIXED_TARGET : `${UNPREFIXED_TARGET}${publicPath}`
}

/**
 * Old prefixed URLs, and the locales that are not published.
 *
 * Permanent, because `/bn/…` is what is in Google's index and in every link
 * anyone has shared since launch. A temporary redirect would leave the index
 * split across two URLs for the same story indefinitely.
 */
export function localeRedirects(): RedirectRule[] {
  return LOCALES.flatMap((locale) => [
    { source: `/${locale}`, destination: '/', permanent: true },
    { source: `/${locale}/:path*`, destination: '/:path*', permanent: true },
  ])
}
