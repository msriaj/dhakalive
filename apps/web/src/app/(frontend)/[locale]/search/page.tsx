import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { isLocale } from '@dhakalive/config'
import { MAX_QUERY_LENGTH } from '@dhakalive/search'

import { Pagination } from '../../../../components/ArticleList'
import { SearchResultList } from '../../../../components/SearchResults'
import { dictionary } from '../../../../lib/dictionary'
import { formatNumber } from '../../../../lib/format'
import { buildMetadata } from '../../../../lib/metadata'
import { searchPath } from '../../../../lib/routes'
import { search } from '../../../../lib/search/query'

/**
 * Search results.
 *
 * Dynamic and never cached: results depend entirely on the query string, and a
 * shared cache keyed on arbitrary user input is both useless and a cache-
 * poisoning surface. Also `noindex` — search result pages are the canonical
 * example of thin, infinitely-variable content.
 */
export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function firstValue(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

function pageNumber(value: string | string[] | undefined): number {
  const parsed = Number.parseInt(firstValue(value) || '1', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { locale: raw } = await params
  if (!isLocale(raw)) return {}

  return buildMetadata({
    locale: raw,
    title: dictionary(raw)('search'),
    path: searchPath(raw),
    noIndex: true,
  })
}

export default async function SearchPage({ params, searchParams }: RouteParams) {
  const { locale: raw } = await params
  if (!isLocale(raw)) notFound()
  const locale = raw
  const d = dictionary(locale)

  const resolved = await searchParams
  // Truncated here as well as in the adapter, so the value echoed back into the
  // input is bounded whatever the backend does with it.
  const query = firstValue(resolved.q).trim().slice(0, MAX_QUERY_LENGTH)
  const page = pageNumber(resolved.page)

  const results = await search({ query, locale, page })

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight">{d('search')}</h1>

      {/* GET so a search is a shareable, bookmarkable URL. */}
      <form action={searchPath(locale)} method="get" role="search" className="mt-6 flex gap-2">
        <label htmlFor="search-input" className="sr-only">
          {d('search')}
        </label>
        <input
          id="search-input"
          type="search"
          name="q"
          defaultValue={query}
          placeholder={d('searchPlaceholder')}
          maxLength={MAX_QUERY_LENGTH}
          autoComplete="off"
          className="min-h-11 flex-1 rounded-md border border-[var(--color-rule)] px-3"
        />
        <button
          type="submit"
          className="min-h-11 rounded-md bg-[var(--color-brand)] px-5 font-medium text-white"
        >
          {d('search')}
        </button>
      </form>

      {/*
        `aria-live` so a screen reader hears the outcome after a submit. The
        region wraps the count and the results together: announcing "24 results"
        while the list below is still the previous one would be worse than
        silence.
      */}
      <div aria-live="polite" className="mt-8">
        {query.length === 0 ? (
          <p className="text-[var(--color-ink-muted)]">{d('searchPrompt')}</p>
        ) : results.failed ? (
          /*
           * A failed backend is reported rather than rendered as "no results".
           * Telling a reader their search found nothing when the truth is that
           * search is down sends them away believing the archive is empty.
           */
          <p className="text-[var(--color-ink-muted)]">{d('searchUnavailable')}</p>
        ) : (
          <>
            <p className="text-sm text-[var(--color-ink-muted)]">
              {formatNumber(results.total, locale)} {d('resultsLabel')}
            </p>

            {results.strategy === 'fuzzy' ? (
              /*
               * The reader is told when these are approximate. Bengali has no
               * stemmer in Postgres, so this path is common rather than
               * exceptional — presenting its output as exact matches would
               * quietly misrepresent what was found.
               */
              <p className="mt-2 rounded-md bg-[var(--color-surface-sunken)] px-3 py-2 text-sm">
                {d('approximateResults')}
              </p>
            ) : null}

            <div className="mt-6">
              <SearchResultList hits={results.hits} locale={locale} />
            </div>

            <Pagination
              locale={locale}
              basePath={searchPath(locale)}
              page={results.page}
              totalPages={results.totalPages}
              params={{ q: query }}
            />
          </>
        )}
      </div>
    </div>
  )
}
