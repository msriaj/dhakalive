import Link from 'next/link'

import type { Locale } from '@dhakalive/config'

import { dictionary } from '../lib/dictionary'
import { formatDateTime, isoDate } from '../lib/format'
import { authorPath } from '../lib/routes'
import type { Article, Author } from '../payload-types'

/**
 * Byline and timestamps.
 *
 * The update time is shown only when it is meaningfully later than publication —
 * a two-minute typo fix does not warrant telling readers the story changed.
 */
const MEANINGFUL_UPDATE_MS = 10 * 60 * 1000

export function Byline({
  article,
  locale,
}: {
  article: Pick<Article, 'authors' | 'publishedAt' | 'updatedAt'>
  locale: Locale
}) {
  const d = dictionary(locale)

  /**
   * An author with no name in this locale is dropped, not rendered empty.
   *
   * `displayName` is localised, so a byline filled in only in English leaves the
   * Bengali page printing "লিখেছেন" followed by nothing, linked to a profile
   * page with an empty heading. Payload's fallback resolves *to* the default
   * locale and so cannot cover a value missing *in* it. A story with no usable
   * byline should read as unbylined rather than as broken.
   */
  const authors = Array.isArray(article.authors)
    ? article.authors.filter(
        (entry): entry is Author =>
          typeof entry === 'object' &&
          entry !== null &&
          typeof entry.displayName === 'string' &&
          entry.displayName.trim().length > 0,
      )
    : []

  const published = article.publishedAt ? new Date(article.publishedAt) : null
  const updated = article.updatedAt ? new Date(article.updatedAt) : null
  const showUpdated =
    published !== null &&
    updated !== null &&
    updated.getTime() - published.getTime() > MEANINGFUL_UPDATE_MS

  return (
    <div className="flex flex-col gap-1 text-sm text-[var(--color-ink-muted)]">
      {authors.length > 0 ? (
        <p>
          <span>{d('by')} </span>
          {authors.map((author, index) => (
            <span key={author.id}>
              {index > 0 ? <span>, </span> : null}
              {author.slug ? (
                <Link
                  href={authorPath(locale, author.slug)}
                  className="font-medium text-[var(--color-ink)] hover:text-[var(--color-brand)]"
                >
                  {author.displayName}
                </Link>
              ) : (
                <span className="font-medium text-[var(--color-ink)]">{author.displayName}</span>
              )}
              {author.designation ? (
                <span className="text-[var(--color-ink-muted)]"> — {author.designation}</span>
              ) : null}
            </span>
          ))}
        </p>
      ) : null}

      {article.publishedAt ? (
        <p>
          {d('publishedOn')}{' '}
          <time dateTime={isoDate(article.publishedAt)}>
            {formatDateTime(article.publishedAt, locale)}
          </time>
        </p>
      ) : null}

      {showUpdated ? (
        <p>
          {d('updatedOn')}{' '}
          <time dateTime={isoDate(article.updatedAt)}>
            {formatDateTime(article.updatedAt, locale)}
          </time>
        </p>
      ) : null}
    </div>
  )
}
