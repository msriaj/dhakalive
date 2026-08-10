import Link from 'next/link'

import type { Locale } from '@dhakalive/config'

import { dictionary } from '../lib/dictionary'
import { formatNumber } from '../lib/format'
import type { ArticleCardData } from '../lib/queries/articles'
import { ArticleCard } from './ArticleCard'

export function ArticleList({
  articles,
  locale,
  columns = 3,
  headingLevel = 3,
}: {
  articles: ArticleCardData[]
  locale: Locale
  columns?: 1 | 2 | 3 | 4
  headingLevel?: 2 | 3 | 4
}) {
  if (articles.length === 0) {
    return <p className="text-[var(--color-ink-muted)]">{dictionary(locale)('noResults')}</p>
  }

  const gridClass = {
    1: 'grid gap-8',
    2: 'grid gap-8 sm:grid-cols-2',
    3: 'grid gap-8 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid gap-8 sm:grid-cols-2 lg:grid-cols-4',
  }[columns]

  return (
    <ul className={gridClass}>
      {articles.map((article) => (
        <li key={article.id}>
          <ArticleCard article={article} locale={locale} headingLevel={headingLevel} />
        </li>
      ))}
    </ul>
  )
}

/**
 * Page navigation for listings.
 *
 * Rendered as links rather than buttons so pages are crawlable, shareable and
 * work without JavaScript. `rel="prev"/"next"` also gives search engines the
 * pagination relationship.
 */
export function Pagination({
  locale,
  basePath,
  page,
  totalPages,
  params,
}: {
  locale: Locale
  basePath: string
  page: number
  totalPages: number
  /** Query parameters to carry across pages — the search term, for instance. */
  params?: Record<string, string>
}) {
  if (totalPages <= 1) return null

  const d = dictionary(locale)

  // Built through URLSearchParams so a term containing `&`, `#` or Bengali
  // characters survives the round trip, and so page 1 keeps a clean URL.
  const hrefFor = (target: number) => {
    const search = new URLSearchParams(params)
    if (target > 1) search.set('page', String(target))
    const query = search.toString()
    return query.length > 0 ? `${basePath}?${query}` : basePath
  }

  return (
    <nav aria-label={d('page')} className="mt-10 flex items-center justify-between gap-4">
      {page > 1 ? (
        <Link
          rel="prev"
          href={hrefFor(page - 1)}
          className="inline-flex min-h-11 items-center rounded-md border border-[var(--color-rule)] px-4"
        >
          {d('previous')}
        </Link>
      ) : (
        <span />
      )}

      <p className="text-sm text-[var(--color-ink-muted)]">
        {d('page')} {formatNumber(page, locale)} / {formatNumber(totalPages, locale)}
      </p>

      {page < totalPages ? (
        <Link
          rel="next"
          href={hrefFor(page + 1)}
          className="inline-flex min-h-11 items-center rounded-md border border-[var(--color-rule)] px-4"
        >
          {d('next')}
        </Link>
      ) : (
        <span />
      )}
    </nav>
  )
}
