import Link from 'next/link'
import type React from 'react'

import type { Locale } from '@dhakalive/config'

import { formatDate, isoDate } from '../lib/format'
import { articlePath, categoryPath } from '../lib/routes'
import type { ArticleCardData } from '../lib/queries/articles'
import { MediaImage } from './MediaImage'

/**
 * `rail` is the one responsive size: a full card while it is stacked below the
 * lead on narrow screens, a thumbnail row once it becomes an actual side rail.
 * It exists as a size rather than two rendered cards because duplicating the
 * markup and hiding one half puts every headline in the document twice.
 */
type CardSize = 'lead' | 'standard' | 'compact' | 'rail'

/**
 * The heading level is a prop so a card slots into the surrounding document
 * outline correctly — a lead card under an `<h1>` needs `<h2>`, the same card
 * inside a section list needs `<h3>`. Written as an explicit switch rather than
 * a `h${level}` template, which TypeScript cannot narrow to a JSX element type.
 */
function CardHeading({
  level,
  className,
  children,
}: {
  level: 2 | 3 | 4
  className: string
  children: React.ReactNode
}) {
  if (level === 2) return <h2 className={className}>{children}</h2>
  if (level === 3) return <h3 className={className}>{children}</h3>
  return <h4 className={className}>{children}</h4>
}

const IMAGE_SIZES: Record<CardSize, string> = {
  lead: '(min-width: 1024px) 720px, 100vw',
  standard: '(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw',
  compact: '112px',
  rail: '(min-width: 1024px) 112px, (min-width: 640px) 50vw, 100vw',
}

/**
 * One story in a listing.
 *
 * The whole card is not a link: the headline is. A card-sized link produces an
 * enormous accessible name and makes the article title, category and timestamp
 * indistinguishable to a screen reader.
 */
export function ArticleCard({
  article,
  locale,
  size = 'standard',
  headingLevel = 3,
  priority = false,
}: {
  article: ArticleCardData
  locale: Locale
  size?: CardSize
  headingLevel?: 2 | 3 | 4
  priority?: boolean
}) {
  const category = typeof article.primaryCategory === 'object' ? article.primaryCategory : null
  if (!article.slug || !category?.slug) return null

  const href = articlePath(locale, category.slug, article.slug)

  const isCompact = size === 'compact'
  const isLead = size === 'lead'
  const isRail = size === 'rail'

  /**
   * The lead card stretches to its grid row and lets the picture take the slack.
   *
   * Beside a rail of stacked cards the lead is always the shorter column, and a
   * fixed 16/9 crop left the difference as dead white space under the headline.
   * Growing the image instead spends that height on the photograph, which is
   * also the only element on a front page that can carry it. The floor keeps
   * the crop from collapsing when the rail happens to be short.
   */
  return (
    <article
      className={
        isCompact
          ? 'flex gap-3'
          : isLead
            ? 'flex h-full flex-col gap-3'
            : isRail
              ? 'flex flex-col gap-3 lg:flex-row'
              : 'flex flex-col gap-3'
      }
    >
      {article.featuredImage ? (
        <Link
          href={href}
          tabIndex={-1}
          aria-hidden="true"
          className={
            isCompact
              ? 'relative block h-20 w-28 shrink-0 overflow-hidden rounded-md bg-[var(--color-surface-sunken)]'
              : isLead
                ? 'relative block max-h-[32rem] min-h-72 flex-1 overflow-hidden rounded-md bg-[var(--color-surface-sunken)]'
                : isRail
                  ? 'relative block aspect-[16/9] overflow-hidden rounded-md bg-[var(--color-surface-sunken)] lg:aspect-auto lg:h-20 lg:w-28 lg:shrink-0'
                  : 'relative block aspect-[16/9] overflow-hidden rounded-md bg-[var(--color-surface-sunken)]'
          }
        >
          <MediaImage
            media={article.featuredImage}
            fill
            sizes={IMAGE_SIZES[size]}
            priority={priority}
            className="object-cover"
          />
        </Link>
      ) : null}

      <div className="min-w-0">
        {!isCompact ? (
          <Link
            href={categoryPath(locale, category.slug)}
            className={
              isRail
                ? 'text-xs font-semibold tracking-wide text-[var(--color-brand)] uppercase lg:hidden'
                : 'text-xs font-semibold tracking-wide text-[var(--color-brand)] uppercase'
            }
          >
            {category.title}
          </Link>
        ) : null}

        <CardHeading
          level={headingLevel}
          className={
            isLead
              ? 'mt-1 text-2xl leading-snug font-bold md:text-3xl'
              : isCompact
                ? 'text-sm leading-snug font-semibold'
                : isRail
                  ? 'mt-1 text-lg leading-snug font-semibold lg:mt-0 lg:text-sm'
                  : 'mt-1 text-lg leading-snug font-semibold'
          }
        >
          <Link href={href} className="hover:text-[var(--color-brand)]">
            {article.headline}
          </Link>
        </CardHeading>

        {size === 'lead' && article.summary ? (
          <p className="mt-2 text-[var(--color-ink-muted)]">{article.summary}</p>
        ) : null}

        {article.publishedAt ? (
          <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
            <time dateTime={isoDate(article.publishedAt)}>
              {formatDate(article.publishedAt, locale)}
            </time>
          </p>
        ) : null}
      </div>
    </article>
  )
}
