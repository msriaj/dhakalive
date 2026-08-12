/**
 * Locale identity lives in `@dhakalive/config` rather than in the Payload config so
 * that route handlers, the worker and pure domain helpers can all agree on the set
 * without importing Payload. Adding a locale here is the single edit point.
 */
export const LOCALES = ['bn', 'en'] as const

export type Locale = (typeof LOCALES)[number]

/** Bengali is the editorial default; `DEFAULT_LOCALE_OVERRIDE` can flip it per deploy. */
export const DEFAULT_LOCALE: Locale = 'bn'

/**
 * The locales the public site actually serves.
 *
 * Distinct from `LOCALES`, which is what the CMS stores. English content is
 * still authored, translated and kept in the database; it is simply not
 * published yet. Dropping `en` from `LOCALES` instead would mean a Payload
 * localization change, and that is a data migration rather than a switch.
 *
 * Everything reader-facing derives from this list — hreflang, sitemaps, feeds,
 * the robots disallow list, search indexing and cache invalidation. Publishing
 * English is therefore one edit here plus removing the `/en` redirect.
 */
export const PUBLIC_LOCALES: readonly Locale[] = ['bn']

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/** Whether a locale is one the public site currently serves. */
export function isPublicLocale(value: unknown): value is Locale {
  return isLocale(value) && PUBLIC_LOCALES.includes(value)
}

/**
 * The URL prefix a locale is served under.
 *
 * The default locale is unprefixed: on a Bengali paper, `/রাজনীতি` is the
 * section and `/bn/রাজনীতি` is a redirect kept alive for the search index.
 * Any other locale keeps its prefix, so publishing English later adds `/en/…`
 * without touching a single Bengali URL.
 */
export function localePrefix(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? '' : `/${locale}`
}
