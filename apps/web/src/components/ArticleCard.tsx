import Link from 'next/link'
import type React from 'react'

import type { Locale } from '@dhakalive/config'

import { kickerFor } from '../lib/article-layout'
import { formatNumber, formatRelativeTime, isoDate } from '../lib/format'
import { articlePath, categoryPath } from '../lib/routes'
import type { ArticleCardData } from '../lib/queries/articles'
import type { Author } from '../payload-types'
import { MediaImage } from './MediaImage'

/**
 * The shapes one story can take in a listing.
 *
 * A mass-market Bengali front page runs a dozen different blocks down one page —
 * a lead with a rail, numbered "most read" columns, a strip of photo essays, a
 * row of columnists — and each wants the same story drawn differently. Written
 * as a set of named sizes rather than per-block markup so that a headline, its
 * kicker, its timestamp and its link semantics are decided once here and cannot
 * drift between blocks.
 *
 * `rail` is the one responsive size: a full card while it is stacked below the
 * lead on narrow screens, a thumbnail row once it becomes an actual side rail.
 * It exists as a size rather than two rendered cards because duplicating the
 * markup and hiding one half puts every headline in the document twice.
 */
export type CardSize =
  /** The front page's main story: tall picture, standfirst, largest headline. */
  | 'lead'
  /** Grid default — thumbnail row on a phone, stacked card once there is width. */
  | 'standard'
  /** Headline and a small thumbnail, nothing else. */
  | 'compact'
  /** Beside the lead: full card on a phone, thumbnail row in the rail. */
  | 'rail'
  /** Always stacked: picture above the headline at every width. */
  | 'tile'
  /** Picture beside the text at every width, with a standfirst. */
  | 'wide'
  /** Headline set over the picture — used where the picture is the story. */
  | 'poster'
  /** Text only. */
  | 'headline'
  /** Text only, with a rank. */
  | 'numbered'
  /** Round author portrait beside the headline, for commentary. */
  | 'portrait'

interface CardSpec {
  root: string
  /** `null` means this size never draws the featured image. */
  figure: string | null
  body: string
  headline: string
  /** Passed to `next/image`; wrong values here are what download a 2000px file to fill a 112px box. */
  sizes: string
  showCategory: boolean
  showKicker: boolean
  showSummary: boolean
  showTime: boolean
}

const SPECS: Record<CardSize, CardSpec> = {
  /**
   * A fixed 16/9 crop, not a picture that grows to fill its column.
   *
   * The lead used to stretch to the height of the tallest column beside it, on
   * the reasoning that a photograph is the one element that can carry spare
   * height. With a short rail that inverts: the picture inflates to 500-odd
   * pixels, pushes the headline off the first screen, and the columns beside it
   * end in a band of white where the grid stretched them to match. A crop the
   * reader can predict is worth more than one that fills whatever is left.
   */
  lead: {
    root: 'flex flex-col gap-3',
    /*
     * 16/9, with a ceiling. Across a 700px centre column an unclamped 16/9 is
     * ~390px of photograph before the headline starts, which is most of a
     * laptop's first screen spent on one story. The cap only bites on a wide
     * viewport; on a phone the crop sits well under it and stays 16/9.
     */
    figure:
      'relative block aspect-[16/9] max-h-[19rem] overflow-hidden rounded-md bg-[var(--color-surface-sunken)]',
    body: 'min-w-0',
    headline: 'mt-1 text-2xl leading-snug font-bold md:text-3xl',
    sizes: '(min-width: 1024px) 720px, 100vw',
    showCategory: true,
    showKicker: true,
    showSummary: true,
    showTime: true,
  },

  /*
   * A thumbnail row on a phone, a stacked card once there is a grid to sit in.
   *
   * One column of full-width pictures turns a front page into a scroll of
   * photographs with headlines between them: only two or three stories are
   * reachable per screen, and the reader has to work to find out what the news
   * is. Beside the headline the picture still identifies the story without
   * being the story.
   *
   * Reversed so the thumbnail sits to the trailing side and the headlines all
   * start on one edge — a column of text with a ragged left margin is markedly
   * harder to skim.
   */
  standard: {
    root: 'flex flex-row-reverse items-start gap-3 sm:flex-col',
    /*
     * `sm:w-full`, not `sm:w-auto`.
     *
     * Above `sm` the card is a column and `items-start` puts the picture on the
     * cross axis, where `w-auto` resolves against the element's own content —
     * and a `fill` image contributes none, so the figure collapsed to nothing
     * and every card in a grid rendered as a bare headline.
     */
    figure:
      'relative block h-24 w-32 shrink-0 overflow-hidden rounded-md bg-[var(--color-surface-sunken)] sm:aspect-[16/9] sm:h-auto sm:w-full',
    body: 'min-w-0 flex-1 sm:flex-none',
    headline: 'mt-1 text-lg leading-snug font-semibold',
    // Below `sm` this is a 128px thumbnail, not a full-width crop; asking for
    // 100vw there would download a header-sized image to paint a thumbnail.
    sizes: '(min-width: 1024px) 360px, (min-width: 640px) 50vw, 128px',
    showCategory: true,
    showKicker: true,
    showSummary: false,
    showTime: true,
  },

  compact: {
    root: 'flex gap-3',
    figure:
      'relative block h-20 w-28 shrink-0 overflow-hidden rounded-md bg-[var(--color-surface-sunken)]',
    body: 'min-w-0',
    headline: 'text-sm leading-snug font-semibold',
    sizes: '112px',
    showCategory: false,
    // Compact rows are a headline and nothing else; a kicker there would take
    // most of the line the headline needs.
    showKicker: false,
    showSummary: false,
    showTime: true,
  },

  rail: {
    // Below `lg` the rail is not a rail — it is the next thing down the page,
    // so it takes the same thumbnail-row shape as the rest of the stack rather
    // than four more full-width pictures.
    root: 'flex flex-row-reverse items-start gap-3 sm:flex-col lg:flex-row',
    figure:
      'relative block h-24 w-32 shrink-0 overflow-hidden rounded-md bg-[var(--color-surface-sunken)] sm:aspect-[16/9] sm:h-auto sm:w-full lg:aspect-auto lg:h-20 lg:w-28',
    body: 'min-w-0 flex-1 sm:flex-none lg:flex-1',
    headline: 'mt-1 text-lg leading-snug font-semibold lg:mt-0 lg:text-sm',
    sizes: '(min-width: 1024px) 112px, (min-width: 640px) 50vw, 128px',
    showCategory: true,
    showKicker: true,
    showSummary: false,
    showTime: true,
  },

  /**
   * Stacked at every width, unlike `standard`.
   *
   * Used by blocks that are a strip of pictures by design — a photo section, a
   * "for you" row — where collapsing to a thumbnail list on a phone would throw
   * away the only thing the block is for.
   */
  tile: {
    root: 'flex flex-col gap-2',
    figure:
      'relative block aspect-[16/9] overflow-hidden rounded-md bg-[var(--color-surface-sunken)]',
    body: 'min-w-0',
    headline: 'text-base leading-snug font-semibold',
    sizes: '(min-width: 1024px) 300px, (min-width: 640px) 45vw, 90vw',
    showCategory: false,
    showKicker: true,
    showSummary: false,
    showTime: true,
  },

  /**
   * The section lead: picture beside the text at every width, with the
   * standfirst kept. Wide enough to carry a summary without the picture
   * shrinking to a thumbnail.
   */
  wide: {
    // `items-start` so the picture keeps its 4/3 crop instead of being stretched
    // to whatever height the headline and standfirst beside it happen to need.
    root: 'flex flex-col gap-4 sm:flex-row sm:items-start',
    figure:
      'relative block aspect-[16/9] shrink-0 overflow-hidden rounded-md bg-[var(--color-surface-sunken)] sm:aspect-[4/3] sm:w-64 lg:w-80',
    body: 'min-w-0 flex-1',
    headline: 'mt-1 text-xl leading-snug font-bold md:text-2xl',
    sizes: '(min-width: 1024px) 320px, (min-width: 640px) 256px, 100vw',
    showCategory: true,
    showKicker: true,
    showSummary: true,
    showTime: true,
  },

  poster: {
    root: 'relative isolate overflow-hidden rounded-md bg-[var(--color-ink)]',
    figure: 'relative block aspect-[4/3]',
    body: 'absolute inset-x-0 bottom-0 z-10 p-3',
    headline: 'text-base leading-snug font-semibold text-white md:text-lg',
    sizes: '(min-width: 1024px) 340px, (min-width: 640px) 45vw, 85vw',
    showCategory: false,
    showKicker: false,
    showSummary: false,
    showTime: false,
  },

  headline: {
    root: 'flex',
    figure: null,
    body: 'min-w-0',
    headline: 'text-base leading-snug font-semibold',
    sizes: '',
    showCategory: false,
    showKicker: true,
    showSummary: false,
    showTime: true,
  },

  numbered: {
    root: 'flex gap-3',
    figure: null,
    body: 'min-w-0 flex-1',
    headline: 'text-[0.9375rem] leading-snug font-semibold',
    sizes: '',
    showCategory: false,
    showKicker: false,
    showSummary: false,
    showTime: false,
  },

  /**
   * Commentary. The portrait is the author's, not the story's — a column is a
   * person's argument, and their face is what a reader recognises in a list of
   * five of them.
   */
  portrait: {
    root: 'flex items-start gap-3',
    figure: null,
    body: 'min-w-0 flex-1',
    headline: 'text-base leading-snug font-semibold',
    sizes: '64px',
    showCategory: false,
    showKicker: false,
    showSummary: false,
    showTime: true,
  },
}

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

/**
 * A photo set and a video look identical as a still frame, and a reader who
 * taps expecting a gallery and gets a video has been misled by the card. The
 * mark is decorative to assistive tech: the kicker beside the headline already
 * says which it is in words.
 */
function MediaBadge({ type }: { type: 'video' | 'photo' }) {
  return (
    <span
      aria-hidden="true"
      className="absolute bottom-1 left-1 inline-flex items-center justify-center rounded-full bg-black/60 p-1 text-white"
    >
      {type === 'video' ? (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M9 3l-1.8 2H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9zm3 5.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9z" />
        </svg>
      )}
    </span>
  )
}

function firstAuthor(article: ArticleCardData): Author | null {
  if (!Array.isArray(article.authors)) return null
  for (const entry of article.authors) {
    if (typeof entry === 'object' && entry !== null) return entry
  }
  return null
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
  rank,
}: {
  article: ArticleCardData
  locale: Locale
  size?: CardSize
  headingLevel?: 2 | 3 | 4
  priority?: boolean
  /** 1-based position, drawn only by the `numbered` size. */
  rank?: number
}) {
  const category = typeof article.primaryCategory === 'object' ? article.primaryCategory : null
  if (!article.slug || !category?.slug) return null

  const spec = SPECS[size]
  const href = articlePath(locale, category.slug, article.slug)
  const kicker = spec.showKicker ? kickerFor(article.articleType, article.headline, locale) : null
  const storyType =
    article.articleType === 'video-story'
      ? 'video'
      : article.articleType === 'photo-story'
        ? 'photo'
        : null

  const author = size === 'portrait' ? firstAuthor(article) : null
  const avatar = author && typeof author.avatar === 'object' ? author.avatar : null

  const timestamp = article.publishedAt ? (
    <p className="mt-2 text-xs text-[var(--color-ink-faint)]">
      {/*
        `dateTime` keeps the machine-readable instant even though the visible
        text is relative, so the timestamp stays useful to crawlers and
        assistive tech once "an hour ago" has stopped being true for a cached
        page.
      */}
      <time dateTime={isoDate(article.publishedAt)}>
        {formatRelativeTime(article.publishedAt, locale)}
      </time>
    </p>
  ) : null

  const heading = (
    <CardHeading level={headingLevel} className={spec.headline}>
      {/*
        The kicker runs inline, ahead of the headline, rather than on its own
        line. It qualifies the headline — "Analysis:", "Opinion:" — and set as
        a separate line it reads as a second, competing title while also
        costing a row of height on every card in a dense list.

        Suppressed for straight reports: "News" above a news story tells a
        reader nothing they had not already assumed.
      */}
      {/*
        The space is a real character, not the margin.

        `me-1.5` separates the two words on screen but leaves the document
        reading "বিশ্লেষণপোশাক রপ্তানিতে" — one run-on word to a screen reader,
        to the search index, and to anything that scrapes the page. Margin is
        not a word boundary.
      */}
      {kicker ? (
        <>
          <span className="font-semibold text-[var(--color-brand)]">{kicker}</span>{' '}
        </>
      ) : null}
      <Link href={href} className="hover:text-[var(--color-brand)]">
        {article.headline}
      </Link>
    </CardHeading>
  )

  /**
   * Headline over the picture.
   *
   * Kept as its own branch rather than a spec flag because the text is inside
   * the figure here, and the scrim between them is load-bearing: white type on
   * an arbitrary press photograph is unreadable without it.
   */
  if (size === 'poster') {
    return (
      <article className={spec.root}>
        {article.featuredImage ? (
          <Link href={href} tabIndex={-1} aria-hidden="true" className={spec.figure ?? ''}>
            <MediaImage
              media={article.featuredImage}
              fill
              sizes={spec.sizes}
              priority={priority}
              className="object-cover"
            />
            {storyType ? <MediaBadge type={storyType} /> : null}
          </Link>
        ) : (
          <div className="aspect-[4/3]" />
        )}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent"
        />
        <div className={spec.body}>{heading}</div>
      </article>
    )
  }

  return (
    <article data-card className={spec.root}>
      {size === 'numbered' ? (
        <span
          aria-hidden="true"
          className="font-[family-name:var(--font-display)] text-xl leading-none font-bold text-[var(--color-brand)] tabular-nums"
        >
          {formatNumber(rank ?? 0, locale)}
        </span>
      ) : null}

      {/*
        No portrait, no circle. A grey disc where a columnist's face should be
        reads as a failed image rather than as an unbylined piece, and the
        headline is better off taking the width.
      */}
      {avatar ? (
        <span className="relative block h-14 w-14 shrink-0 overflow-hidden rounded-full bg-[var(--color-surface-sunken)]">
          <MediaImage media={avatar} fill sizes={spec.sizes} className="object-cover" />
        </span>
      ) : null}

      {spec.figure && article.featuredImage ? (
        <Link href={href} tabIndex={-1} aria-hidden="true" className={spec.figure}>
          <MediaImage
            media={article.featuredImage}
            fill
            sizes={spec.sizes}
            priority={priority}
            className="object-cover"
          />
          {storyType ? <MediaBadge type={storyType} /> : null}
        </Link>
      ) : null}

      <div className={spec.body}>
        {spec.showCategory ? (
          <Link
            href={categoryPath(locale, category.slug)}
            className={
              // In the rail proper the category is dropped: at 112px wide it
              // costs a line that the headline needs more.
              size === 'rail'
                ? 'text-xs font-semibold tracking-wide text-[var(--color-brand)] uppercase lg:hidden'
                : 'text-xs font-semibold tracking-wide text-[var(--color-brand)] uppercase'
            }
          >
            {category.title}
          </Link>
        ) : null}

        {heading}

        {size === 'portrait' && author?.displayName ? (
          <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{author.displayName}</p>
        ) : null}

        {spec.showSummary && article.summary ? (
          <p className="mt-2 text-[var(--color-ink-muted)]">{article.summary}</p>
        ) : null}

        {spec.showTime ? timestamp : null}
      </div>
    </article>
  )
}
