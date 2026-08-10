import Link from 'next/link'
import type React from 'react'

import type { Locale } from '@dhakalive/config'
import type { SearchHit, Snippet } from '@dhakalive/search'

import { dictionary } from '../lib/dictionary'
import { formatDate, isoDate } from '../lib/format'

/**
 * Renders the highlighted runs a search adapter returns.
 *
 * The adapter hands back `{ text, match }` segments rather than an HTML string
 * precisely so this can emit real elements: the matched text comes partly from
 * the reader's own query, and `dangerouslySetInnerHTML` here would make the
 * search box an injection point. React escapes every segment.
 *
 * `<mark>` rather than `<b>` because the meaning is "this is why the result
 * matched", which is what assistive technology announces it as.
 */
export function Highlighted({
  snippets,
  fallback,
}: {
  snippets: readonly Snippet[]
  fallback?: string | null
}): React.ReactNode {
  if (snippets.length === 0) return fallback ?? null

  return snippets.map((snippet, index) =>
    snippet.match ? (
      // Index keys are safe here: the list is derived from one string, is
      // rendered in order, and is never reordered or edited in place.
      <mark key={index} className="bg-[var(--color-brand)]/15 text-inherit">
        {snippet.text}
      </mark>
    ) : (
      <span key={index}>{snippet.text}</span>
    ),
  )
}

/**
 * One result.
 *
 * Deliberately plainer than `ArticleCard`: results mix articles with standing
 * pages, and a page has no section, byline or image to render. What matters on
 * this screen is why the result matched, which is the highlighted extract.
 */
function Result({ hit, locale }: { hit: SearchHit; locale: Locale }) {
  return (
    <article>
      <h2 className="text-lg leading-snug font-semibold">
        <Link href={hit.url} className="hover:text-[var(--color-brand)]">
          <Highlighted snippets={hit.titleSnippet} fallback={hit.title} />
        </Link>
      </h2>

      {hit.bodySnippet.length > 0 ? (
        <p className="mt-1 text-[var(--color-ink-muted)]">
          <Highlighted snippets={hit.bodySnippet} />
        </p>
      ) : null}

      <p className="mt-2 flex flex-wrap gap-x-3 text-xs text-[var(--color-ink-muted)]">
        {hit.sectionTitle ? <span>{hit.sectionTitle}</span> : null}
        {hit.authors.length > 0 ? <span>{hit.authors.join(', ')}</span> : null}
        {hit.publishedAt ? (
          <time dateTime={isoDate(hit.publishedAt)}>{formatDate(hit.publishedAt, locale)}</time>
        ) : null}
      </p>
    </article>
  )
}

export function SearchResultList({ hits, locale }: { hits: SearchHit[]; locale: Locale }) {
  const d = dictionary(locale)

  if (hits.length === 0) {
    return <p className="text-[var(--color-ink-muted)]">{d('noResults')}</p>
  }

  return (
    <ul className="space-y-8">
      {hits.map((hit) => (
        <li key={`${hit.collection}:${hit.documentId}:${hit.locale}`}>
          <Result hit={hit} locale={locale} />
        </li>
      ))}
    </ul>
  )
}
