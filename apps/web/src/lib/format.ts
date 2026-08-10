import type { Locale } from '@dhakalive/config'

/**
 * Locale-aware formatting.
 *
 * Bengali uses its own digits, so dates and counts must go through `Intl` with
 * the `bn-BD` locale rather than being assembled by hand — `২০২৬` is what a
 * Bengali reader expects, not `2026`.
 */

const DATE_LOCALE: Record<Locale, string> = {
  bn: 'bn-BD',
  en: 'en-GB',
}

const TIME_ZONE = 'Asia/Dhaka'

export function formatDate(value: string | null | undefined, locale: Locale): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat(DATE_LOCALE[locale], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: TIME_ZONE,
  }).format(date)
}

export function formatDateTime(value: string | null | undefined, locale: Locale): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat(DATE_LOCALE[locale], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: TIME_ZONE,
  }).format(date)
}

export function formatTime(value: string | null | undefined, locale: Locale): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat(DATE_LOCALE[locale], {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: TIME_ZONE,
  }).format(date)
}

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(DATE_LOCALE[locale]).format(value)
}

/** `datetime` attribute for <time>, always machine-readable ISO regardless of locale. */
export function isoDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}
