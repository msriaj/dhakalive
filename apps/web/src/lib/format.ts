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

/**
 * "৫০ মিনিট আগে" for anything recent, a plain date once it is not.
 *
 * On a front page the useful question is how fresh a story is, and an absolute
 * date answers it only after the reader has worked out today's. Past a couple
 * of days the relationship inverts — "৯ দিন আগে" is harder to place than the
 * date itself — so the format switches rather than counting up forever.
 *
 * `Intl.RelativeTimeFormat` supplies the Bengali wording and digits; writing
 * the strings by hand would mean maintaining plural rules for two languages.
 */
const RELATIVE_CUTOFF_DAYS = 2

export function formatRelativeTime(
  value: string | null | undefined,
  locale: Locale,
  now: Date = new Date(),
): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const seconds = Math.round((date.getTime() - now.getTime()) / 1000)
  const absolute = Math.abs(seconds)
  if (absolute >= RELATIVE_CUTOFF_DAYS * 86_400) return formatDate(value, locale)

  const relative = new Intl.RelativeTimeFormat(DATE_LOCALE[locale], { numeric: 'auto' })

  /**
   * Rounded on the magnitude, then re-signed.
   *
   * `Math.round` breaks ties toward positive infinity, so rounding a negative
   * offset directly makes the past and the future disagree: -1.5 hours becomes
   * "1 hour ago" while +1.5 becomes "in 2 hours". Rounding the absolute value
   * keeps a story published ninety minutes ago and an event ninety minutes
   * away the same distance from now.
   */
  const sign = seconds < 0 ? -1 : 1
  const step = (unit: number) => sign * Math.round(absolute / unit)

  // Largest unit the elapsed time fills, so an hour and a half reads in hours
  // rather than as ninety minutes.
  if (absolute < 60) return relative.format(step(1), 'second')
  if (absolute < 3_600) return relative.format(step(60), 'minute')
  if (absolute < 86_400) return relative.format(step(3_600), 'hour')
  return relative.format(step(86_400), 'day')
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
