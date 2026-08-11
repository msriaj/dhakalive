import Link from 'next/link'
import type React from 'react'

import type { Locale } from '@dhakalive/config'

import type { HomeSection } from '../lib/queries/home'
import type { ArticleCardData } from '../lib/queries/articles'
import { AdSlot } from './AdSlot'
import { ArticleCard } from './ArticleCard'

/**
 * The front page's section blocks.
 *
 * A Bengali mass-market daily does not run one grid down its front page: the
 * politics block is a lead with a headline rail, "most read" is four numbered
 * columns, the commentary block is a row of columnists' faces, and the photo
 * block is a strip of pictures. Each of those is a different *reading*, not
 * decoration — a numbered list says "ranked", a portrait row says "this is
 * somebody's opinion" — so the layouts live here as a closed set an editor
 * picks from, rather than as free-form blocks.
 *
 * Every layout takes the same input: an ordered list of stories, or a set of
 * columns. Nothing here queries.
 */

/** Hairline-separated row, which is how a dense list gets its separation. */
const ROW = 'border-b border-[var(--color-rule)] py-3 first:pt-0 last:border-0'

function Rows({
  articles,
  locale,
  size,
  className,
}: {
  articles: ArticleCardData[]
  locale: Locale
  size: 'compact' | 'headline'
  className?: string
}) {
  return (
    <ul className={className}>
      {articles.map((article) => (
        <li key={article.id} className={ROW}>
          <ArticleCard article={article} locale={locale} size={size} headingLevel={3} />
        </li>
      ))}
    </ul>
  )
}

/**
 * The section name carries a red rule directly beneath it rather than sitting
 * on a full-width hairline. Anchored to the words, the mark reads as belonging
 * to this block; run edge to edge it reads as a divider between two, which is
 * the opposite of what a reader needs when the blocks are stacked this closely.
 *
 * The name is itself the link to the section, with the chevron as its
 * affordance. A separate "more from X" link beside the heading gave the same
 * destination two controls and made the heading — the larger, more obvious
 * target — the dead one.
 */
export function SectionHeading({
  id,
  href,
  children,
}: {
  id?: string
  href?: string | null
  children: React.ReactNode
}) {
  const base = 'section-heading border-b-2 border-[var(--color-brand)] pb-1'

  return (
    <div className="mb-4">
      <h2 id={id} className="inline-block">
        {href ? (
          <Link href={href} className={`${base} group inline-flex items-center gap-1`}>
            {children}
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="currentColor"
              className="text-[var(--color-brand)] transition-transform group-hover:translate-x-0.5"
            >
              <path d="M9.4 18.4 8 17l5-5-5-5 1.4-1.4L15.8 12z" />
            </svg>
          </Link>
        ) : (
          <span className={base}>{children}</span>
        )}
      </h2>
    </div>
  )
}

function SectionBody({ section, locale }: { section: HomeSection; locale: Locale }) {
  const articles = section.articles

  switch (section.layout) {
    /**
     * The section's own lead, with the rest of the block as a headline rail
     * beside it. The commonest shape on the page and the one closest to how a
     * printed section front is set.
     */
    case 'section-lead': {
      const [first, ...rest] = articles
      return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          {first ? (
            <ArticleCard article={first} locale={locale} size="wide" headingLevel={3} />
          ) : null}
          {rest.length > 0 ? (
            <Rows
              articles={rest}
              locale={locale}
              size="compact"
              className="sm:grid sm:grid-cols-2 sm:gap-x-6 lg:block"
            />
          ) : null}
        </div>
      )
    }

    /** An even grid of pictures — a "for you" row, a features strip. */
    case 'story-cards':
      return (
        <ul className="grid grid-cols-2 gap-x-5 gap-y-6 lg:grid-cols-4">
          {articles.map((article) => (
            <li key={article.id}>
              <ArticleCard article={article} locale={locale} size="tile" headingLevel={3} />
            </li>
          ))}
        </ul>
      )

    /** Thumbnail beside each headline: the densest shape that still has pictures. */
    case 'headline-rows':
      return (
        <ul className="grid gap-y-5 sm:grid-cols-2 sm:gap-8 lg:grid-cols-4">
          {articles.map((article) => (
            <li
              key={article.id}
              className="border-b border-[var(--color-rule)] pb-5 last:border-0 sm:border-0 sm:pb-0"
            >
              <ArticleCard article={article} locale={locale} size="standard" headingLevel={3} />
            </li>
          ))}
        </ul>
      )

    case 'headline-list':
      return (
        <Rows
          articles={articles}
          locale={locale}
          size="headline"
          className="sm:grid sm:grid-cols-2 sm:gap-x-8 lg:grid-cols-3"
        />
      )

    /**
     * Ranked, and numbered because it is ranked. An ordered list rather than a
     * styled `ul`: the position is the information here, so it belongs in the
     * markup and not only in a red numeral.
     */
    case 'numbered-list':
      return (
        <ol className="sm:grid sm:grid-cols-2 sm:gap-x-8 lg:grid-cols-4">
          {articles.map((article, index) => (
            <li key={article.id} className={ROW}>
              <ArticleCard
                article={article}
                locale={locale}
                size="numbered"
                headingLevel={3}
                rank={index + 1}
              />
            </li>
          ))}
        </ol>
      )

    /**
     * One picture story, two cards, then a column of headlines. Three densities
     * in one block, which is how a section front carries nine stories without
     * asking a reader to scan nine identical cards.
     */
    case 'mosaic': {
      const [hero, second, third, ...rest] = articles
      const middle = [second, third].filter((entry): entry is ArticleCardData => Boolean(entry))

      return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)]">
          {hero ? (
            <ArticleCard article={hero} locale={locale} size="tile" headingLevel={3} />
          ) : null}

          {middle.length > 0 ? (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
              {middle.map((article) => (
                <li key={article.id}>
                  <ArticleCard article={article} locale={locale} size="tile" headingLevel={3} />
                </li>
              ))}
            </ul>
          ) : null}

          {rest.length > 0 ? <Rows articles={rest} locale={locale} size="headline" /> : null}
        </div>
      )
    }

    /**
     * Commentary. Vertical rules between the columnists, because five faces in
     * a row with nothing between them read as one strip rather than as five
     * separate arguments.
     */
    case 'opinion':
      return (
        <ul className="grid gap-y-4 sm:grid-cols-2 lg:grid-cols-5">
          {articles.map((article) => (
            <li
              key={article.id}
              className="border-b border-[var(--color-rule)] pb-4 last:border-0 sm:border-0 sm:pb-0 lg:border-b-0 lg:border-l lg:pl-5 lg:first:border-l-0 lg:first:pl-0"
            >
              <ArticleCard article={article} locale={locale} size="portrait" headingLevel={3} />
            </li>
          ))}
        </ul>
      )

    /** Boxed, so a short row between two sections reads as its own thing. */
    case 'tiny-cards':
      return (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {articles.map((article) => (
            <li
              key={article.id}
              className="rounded-md border border-[var(--color-rule)] bg-[var(--color-surface-raised)] p-3"
            >
              <ArticleCard article={article} locale={locale} size="compact" headingLevel={3} />
            </li>
          ))}
        </ul>
      )

    /**
     * Sideways rather than down.
     *
     * A picture block is the one place a full-bleed image earns its height, but
     * stacked vertically five of them are a screen and a half of scrolling on a
     * phone for one section. Laid along the horizontal the block costs one
     * card's height whatever it holds, and the cards are narrow enough on a
     * phone that the next one is visibly there to swipe to.
     */
    case 'photo-strip':
    case 'video-row':
      return (
        <ul className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2">
          {articles.map((article, index) => (
            <li
              key={article.id}
              className="w-[62%] shrink-0 snap-start sm:w-[42%] lg:w-[calc((100%-3rem)/4)]"
            >
              <ArticleCard
                article={article}
                locale={locale}
                size="poster"
                headingLevel={3}
                priority={index === 0 && section.layout === 'photo-strip'}
              />
            </li>
          ))}
        </ul>
      )

    /**
     * A column per sub-section, each with its own heading. This is the block a
     * front page ends on: four sections, three stories each, no pictures.
     */
    case 'collection-columns':
      return (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {section.columns.map((column) => (
            <div
              key={column.key}
              className="lg:border-l lg:border-[var(--color-rule)] lg:ps-5 lg:first:border-l-0 lg:first:ps-0"
            >
              {column.heading ? (
                <h3 className="mb-3 border-b border-[var(--color-rule-strong)] pb-2 font-[family-name:var(--font-display)] text-base font-bold">
                  {column.href ? (
                    <Link href={column.href} className="hover:text-[var(--color-brand)]">
                      {column.heading}
                    </Link>
                  ) : (
                    column.heading
                  )}
                </h3>
              ) : null}
              <Rows articles={column.articles} locale={locale} size="compact" />
            </div>
          ))}
        </div>
      )
  }
}

/**
 * One section block, with its heading and — when the block is sold with one —
 * a rail advertisement beside it.
 *
 * The ad sits in the grid rather than floating over the block so that it takes
 * its own column on a wide screen and drops below the stories on a phone,
 * which is the one arrangement that never reflows editorial content when a
 * creative fails to load.
 */
export function HomeSectionBlock({ section, locale }: { section: HomeSection; locale: Locale }) {
  const headingId = `section-${section.key}`
  const body = <SectionBody section={section} locale={locale} />

  return (
    <section aria-labelledby={section.heading ? headingId : undefined}>
      {section.heading ? (
        <SectionHeading id={headingId} href={section.href}>
          {section.heading}
        </SectionHeading>
      ) : null}

      {section.showAd ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">{body}</div>
          <AdSlot
            placement="sidebar"
            locale={locale}
            categoryId={section.categoryId}
            pageKey={`home:${section.key}`}
            className="lg:sticky lg:top-4 lg:self-start"
          />
        </div>
      ) : (
        body
      )}
    </section>
  )
}
