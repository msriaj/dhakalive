import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { isLocale } from '@dhakalive/config'

import { dictionary } from '../../../../lib/dictionary'
import { buildMetadata } from '../../../../lib/metadata'
import { searchPath } from '../../../../lib/routes'

/**
 * Search results.
 *
 * Dynamic and never cached: results depend entirely on the query string, and a
 * shared cache keyed on arbitrary user input is both useless and a cache-
 * poisoning surface. Also `noindex` — search result pages are the canonical
 * example of thin, infinitely-variable content.
 *
 * The search backend itself is Phase 6. This is the route, its metadata and its
 * accessible form; wiring it to the provider abstraction is that phase's work.
 */
export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
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

  const rawQuery = (await searchParams).q
  const query = (Array.isArray(rawQuery) ? rawQuery[0] : rawQuery)?.trim() ?? ''

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

      <div aria-live="polite" className="mt-8">
        {query.length === 0 ? null : (
          <p className="text-[var(--color-ink-muted)]">
            {/* Phase 6 replaces this with real results from the search adapter. */}
            {d('noResults')}
          </p>
        )}
      </div>
    </div>
  )
}
