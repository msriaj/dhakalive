import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { DEFAULT_LOCALE, LOCALES, isLocale } from '@dhakalive/config'

import { ArticleCard } from '../../../components/ArticleCard'
import { ArticleList } from '../../../components/ArticleList'
import { HomeSectionBlock, SectionHeading } from '../../../components/HomeSections'
import { JsonLd } from '../../../components/JsonLd'
import { dictionary } from '../../../lib/dictionary'
import { buildMetadata } from '../../../lib/metadata'
import { composeHomepage } from '../../../lib/queries/home'
import { getHomepage, getSeoDefaults, getSiteSettings } from '../../../lib/queries/globals'
import { env } from '../../../lib/env'
import { absoluteUrl, homePath } from '../../../lib/routes'
import { homeGraph } from '../../../lib/seo/structured-data'

/**
 * Homepage.
 *
 * Incrementally regenerated every 60 seconds, and revalidated on demand when
 * content changes (Phase 5). The front page is the most-requested and
 * most-frequently-changing page on a news site, so it gets the shortest
 * time-based window of any cached route.
 */
export const revalidate = 60

/**
 * The front page had no metadata of its own, which meant no canonical URL, no
 * Open Graph card when the domain root is shared, and — once feeds existed — no
 * autodiscovery on the one page most readers land on first.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale: raw } = await params
  if (!isLocale(raw)) return {}
  const locale = raw

  const [settings, defaults] = await Promise.all([getSiteSettings(locale), getSeoDefaults(locale)])
  const siteUrl = env().NEXT_PUBLIC_SITE_URL

  return buildMetadata({
    locale,
    title: settings.siteName ?? 'DhakaLive',
    absoluteTitle: true,
    description: settings.tagline ?? defaults.defaultDescription,
    path: homePath(locale),
    alternates: {
      ...Object.fromEntries<string>(
        LOCALES.map((candidate) => [candidate, absoluteUrl(homePath(candidate), siteUrl)]),
      ),
      'x-default': absoluteUrl(homePath(DEFAULT_LOCALE), siteUrl),
    },
    image: settings.logo,
  })
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params
  if (!isLocale(raw)) notFound()
  const locale = raw
  const d = dictionary(locale)

  const homepage = await getHomepage(locale)

  /**
   * Composition — which story goes where, and which block gets to keep it when
   * two want the same one — lives in `composeHomepage`. This file is the
   * arrangement of the page and nothing else.
   */
  const page = await composeHomepage(homepage, locale)

  /**
   * The front page describes the publication, not one story. Emitting a
   * `NewsArticle` for the lead here would compete with the article's own page
   * for the same URL, so this carries the organisation and the site only.
   */
  const graph = await homeGraph(locale)

  return (
    /*
     * Tighter than before. A front page at this density earns its separation
     * from rules and heading weight, not from empty space — and every extra
     * gap between blocks is a story pushed below the fold.
     */
    <div className="space-y-9">
      <JsonLd data={graph} />

      {page.lead ? (
        <section aria-labelledby="lead-heading">
          <h1 id="lead-heading" className="sr-only">
            {d('latest')}
          </h1>

          {/*
            Three columns on a wide screen: a headline column, the lead, and a
            rail. This is the shape a Bengali daily's front page has had in
            print for decades and the reason is unchanged — a reader arriving
            at the page should be able to see the main story *and* a dozen
            other headlines without scrolling, rather than one photograph.

            On a phone the columns become one, and the order is set explicitly
            so the lead comes first: source order puts the side column above
            it, which would open the page on a list of secondary headlines.
          */}
          {/*
            18rem a side, and the lead takes what is left.

            The centre column is the one that can afford to lose width: its
            headline is set large enough to survive a narrower measure, and its
            picture is capped anyway. The side columns cannot — a compact card
            spends 7rem on the thumbnail, so at 15rem the headline was down to
            four words a line and the column stopped being scannable, which is
            the only thing it is there to be. Taking 3rem from the middle buys
            both of them a readable measure and puts more headlines above the
            fold, which is what the row is for.
          */}
          {/*
            `items-start`, so a short column ends where its stories end.

            Grid items stretch by default, which made every column as tall as
            the tallest — and a column of two stories then spread its own rows
            across that height, opening gaps between headlines that had nothing
            in them. Each column now sets its own height and the rules between
            them run only as far as the column does.
          */}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)_minmax(0,18rem)] lg:items-start lg:gap-5">
            {page.side.length > 0 ? (
              <ul className="order-2 lg:order-none lg:border-e lg:border-[var(--color-rule)] lg:pe-5">
                {page.side.map((article) => (
                  <li
                    key={article.id}
                    className="border-b border-[var(--color-rule)] py-3 first:pt-0 last:border-0 lg:last:pb-0"
                  >
                    <ArticleCard
                      article={article}
                      locale={locale}
                      size="compact"
                      headingLevel={2}
                    />
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="order-1 lg:order-none">
              <ArticleCard
                article={page.lead}
                locale={locale}
                size="lead"
                headingLevel={2}
                priority
              />
            </div>

            {/*
             * Thumbnail-and-headline in the rail, full cards on narrow screens.
             *
             * Stacked beside the lead, four 16/9 cards run roughly twice its
             * height, and the difference shows up as empty space under the lead
             * headline. Compact rows keep the columns close enough that the row
             * has no slack to leave behind. Below `lg` the rail is not a rail —
             * it is the next thing down the page — so the pictures come back and
             * the cards are hairline-separated instead.
             */}
            {page.rail.length > 0 ? (
              <ul className="order-3 grid gap-6 sm:grid-cols-2 lg:order-none lg:block lg:gap-0 lg:border-s lg:border-[var(--color-rule)] lg:ps-5">
                {page.rail.map((article) => (
                  <li
                    key={article.id}
                    className="lg:border-b lg:border-[var(--color-rule)] lg:py-3 lg:first:pt-0 lg:last:border-0 lg:last:pb-0"
                  >
                    <ArticleCard article={article} locale={locale} size="rail" headingLevel={2} />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>
      ) : null}

      {/*
        The topics strip.

        One line, scrolled sideways rather than wrapped to three rows: it is
        navigation between the lead and the rest of the page, and a block of
        chips that tall separates them instead of joining them.
      */}
      {page.topics.length > 0 ? (
        <nav
          aria-label={homepage.trendingTags?.heading ?? d('trendingTopics')}
          className="flex items-center gap-3 border-y border-[var(--color-rule)] py-2"
        >
          <span className="shrink-0 text-xs font-bold tracking-wide text-[var(--color-brand)] uppercase">
            {homepage.trendingTags?.heading ?? d('trendingTopics')}
          </span>
          <ul className="flex min-w-0 gap-2 overflow-x-auto">
            {page.topics.map((topic) => (
              <li key={topic.key} className="shrink-0">
                <Link
                  href={topic.href}
                  className="inline-flex rounded-full bg-[var(--color-surface-sunken)] px-3 py-1 text-sm hover:text-[var(--color-brand)]"
                >
                  {topic.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {/* The row of cards under the lead assembly: still the top of the page. */}
      {page.subLeads.length > 0 ? (
        <section aria-label={d('moreTopStories')}>
          <ul className="grid grid-cols-2 gap-x-5 gap-y-6 lg:grid-cols-3">
            {page.subLeads.map((article) => (
              <li key={article.id}>
                <ArticleCard article={article} locale={locale} size="tile" headingLevel={2} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {page.latest.length > 0 ? (
        <section aria-labelledby="latest-heading">
          <SectionHeading id="latest-heading">
            {homepage.latestNews?.heading ?? d('latest')}
          </SectionHeading>
          <ArticleList articles={page.latest} locale={locale} columns={4} />
        </section>
      ) : null}

      {page.sections.map((section) => (
        <HomeSectionBlock key={section.key} section={section} locale={locale} />
      ))}

      {page.picks.length > 0 ? (
        <section aria-labelledby="picks-heading">
          <SectionHeading id="picks-heading">
            {homepage.editorsPicks?.heading ?? "Editor's picks"}
          </SectionHeading>
          <ArticleList articles={page.picks} locale={locale} columns={3} />
        </section>
      ) : null}

      {page.media.length > 0 ? (
        <section aria-labelledby="media-heading">
          <SectionHeading id="media-heading">
            {homepage.mediaSection?.heading ?? 'Photo & video'}
          </SectionHeading>
          <ul className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2">
            {page.media.map((article) => (
              <li
                key={article.id}
                className="w-[62%] shrink-0 snap-start sm:w-[42%] lg:w-[calc((100%-3rem)/4)]"
              >
                <ArticleCard article={article} locale={locale} size="poster" headingLevel={3} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
