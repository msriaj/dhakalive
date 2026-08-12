import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { isPublicLocale, type Locale } from '@dhakalive/config'

import { ArticleList, Pagination } from '../../../../../components/ArticleList'
import { Breadcrumbs } from '../../../../../components/Breadcrumbs'
import { dictionary } from '../../../../../lib/dictionary'
import { formatDate } from '../../../../../lib/format'
import { buildMetadata } from '../../../../../lib/metadata'
import { getArticlesByDateRange } from '../../../../../lib/queries/articles'
import { archivePath } from '../../../../../lib/routes'

/**
 * Date archive: /archive/2026, /archive/2026/08, /archive/2026/08/10.
 *
 * Archives are `noindex`: they multiply thin, near-duplicate listings across
 * every year, month and day, which is exactly the pattern that dilutes a news
 * site's crawl budget. They remain fully linkable and usable for readers.
 */
export const revalidate = 600

interface RouteParams {
  params: Promise<{ locale: string; date: string[] }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

interface Range {
  from: Date
  to: Date
  year: number
  month?: number
  day?: number
}

/** Dates are interpreted in Asia/Dhaka (UTC+6), the newsroom's timezone. */
const DHAKA_OFFSET_MINUTES = 6 * 60

function dhakaDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 0, -DHAKA_OFFSET_MINUTES, 0))
}

/** Parses the segments, returning null for anything that is not a real date. */
function parseRange(segments: string[]): Range | null {
  if (segments.length === 0 || segments.length > 3) return null

  const numbers = segments.map((segment) => Number.parseInt(segment, 10))
  if (numbers.some((value) => !Number.isFinite(value))) return null

  const [year, month, day] = numbers as [number, number | undefined, number | undefined]
  if (year < 1900 || year > 2200) return null

  if (month === undefined) {
    return { from: dhakaDate(year, 1, 1), to: dhakaDate(year + 1, 1, 1), year }
  }
  if (month < 1 || month > 12) return null

  if (day === undefined) {
    const nextMonth = month === 12 ? dhakaDate(year + 1, 1, 1) : dhakaDate(year, month + 1, 1)
    return { from: dhakaDate(year, month, 1), to: nextMonth, year, month }
  }
  if (day < 1 || day > 31) return null

  const from = dhakaDate(year, month, day)
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000)
  // Rejects 31 February and friends: the constructed date would roll over.
  if (from.getUTCMonth() !== dhakaDate(year, month, 1).getUTCMonth()) return null

  return { from, to, year, month, day }
}

function label(range: Range, locale: Locale): string {
  if (range.day !== undefined) return formatDate(range.from.toISOString(), locale)
  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-GB', {
    year: 'numeric',
    ...(range.month !== undefined ? { month: 'long' } : {}),
    timeZone: 'Asia/Dhaka',
  }).format(range.from)
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { locale: raw, date } = await params
  if (!isPublicLocale(raw)) return {}
  const range = parseRange(date)
  if (!range) return {}

  return buildMetadata({
    locale: raw,
    title: `${dictionary(raw)('archiveFor')} ${label(range, raw)}`,
    path: archivePath(raw, range.year, range.month, range.day),
    noIndex: true,
  })
}

export default async function ArchivePage({ params, searchParams }: RouteParams) {
  const { locale: raw, date } = await params
  if (!isPublicLocale(raw)) notFound()
  const locale = raw
  const d = dictionary(locale)

  const range = parseRange(date)
  if (!range) notFound()

  const rawPage = (await searchParams).page
  const pageValue = Array.isArray(rawPage) ? rawPage[0] : rawPage
  const parsed = Number.parseInt(pageValue ?? '1', 10)
  const page = Number.isFinite(parsed) && parsed > 0 ? parsed : 1

  const articles = await getArticlesByDateRange(range.from, range.to, { locale, limit: 20, page })

  return (
    <div>
      <Breadcrumbs
        locale={locale}
        crumbs={[{ label: `${d('archiveFor')} ${label(range, locale)}` }]}
      />

      <header className="mt-4 border-b border-[var(--color-rule)] pb-4">
        <h1 className="text-3xl font-bold tracking-tight">
          {d('archiveFor')} {label(range, locale)}
        </h1>
      </header>

      <div className="mt-8">
        <ArticleList articles={articles.docs} locale={locale} columns={2} headingLevel={2} />
        <Pagination
          locale={locale}
          basePath={archivePath(locale, range.year, range.month, range.day)}
          page={articles.page}
          totalPages={articles.totalPages}
        />
      </div>
    </div>
  )
}
