/**
 * Locale identity lives in `@dhakalive/config` rather than in the Payload config so
 * that route handlers, the worker and pure domain helpers can all agree on the set
 * without importing Payload. Adding a locale here is the single edit point.
 */
export const LOCALES = ['bn', 'en'] as const

export type Locale = (typeof LOCALES)[number]

/** Bengali is the editorial default; `DEFAULT_LOCALE_OVERRIDE` can flip it per deploy. */
export const DEFAULT_LOCALE: Locale = 'bn'

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}
