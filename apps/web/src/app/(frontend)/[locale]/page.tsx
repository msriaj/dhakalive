import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { DEFAULT_LOCALE, LOCALES, isLocale } from '@dhakalive/config'

import { ArticleCard } from '../../../components/ArticleCard'
import { ArticleList } from '../../../components/ArticleList'
import { JsonLd } from '../../../components/JsonLd'
import { dictionary } from '../../../lib/dictionary'
import {
  getArticlesByCategory,
  getArticlesByType,
  getLatestArticles,
} from '../../../lib/queries/articles'
import { buildMetadata } from '../../../lib/metadata'
import { getHomepage, getSeoDefaults, getSiteSettings } from '../../../lib/queries/globals'
import { env } from '../../../lib/env'
import { absoluteUrl, categoryPath, homePath } from '../../../lib/routes'
import { homeGraph } from '../../../lib/seo/structured-data'
import type { Article } from '../../../payload-types'

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

function populatedArticle(value: unknown): Article | null {
  return typeof value === 'object' && value !== null ? (value as Article) : null
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params
  if (!isLocale(raw)) notFound()
  const locale = raw
  const d = dictionary(locale)

  const homepage = await getHomepage(locale)

  const lead = populatedArticle(homepage.leadStory)

  /**
   * The rail cannot repeat the lead, or repeat itself.
   *
   * Nothing in the admin UI stops an editor putting one story in both the lead
   * slot and the secondary list, and when that happens the front page runs the
   * same headline twice side by side. Filtering here rather than asking editors
   * to remember is the only version that stays true.
   */
  const secondary = (
    Array.isArray(homepage.secondaryLeads)
      ? homepage.secondaryLeads
          .map(populatedArticle)
          .filter((entry): entry is Article => entry !== null)
      : []
  ).filter(
    (entry, index, all) =>
      entry.id !== lead?.id && all.findIndex((other) => other.id === entry.id) === index,
  )

  const picks = Array.isArray(homepage.editorsPicks?.articles)
    ? homepage.editorsPicks.articles
        .map(populatedArticle)
        .filter((entry): entry is Article => entry !== null)
    : []

  /**
   * One story, one place on the page.
   *
   * The exclusion set has to grow as the page is composed. Computing it once
   * from the lead and the rail — as this did — meant the latest list and every
   * category block filtered against the same frozen set and never against each
   * other, so a photo story could run in the latest list, again in its section,
   * and a third time in the media block.
   *
   * Curated slots are reserved first and queries fill in around them: an editor
   * who put a story in the lead, the rail or the picks chose that placement,
   * and a query result should not be able to take it.
   */
  const shown = new Set<number>(
    [lead?.id, ...secondary.map((entry) => entry.id), ...picks.map((entry) => entry.id)].filter(
      (id): id is number => typeof id === 'number',
    ),
  )

  const latest = await getLatestArticles({
    locale,
    limit: homepage.latestNews?.limit ?? 10,
    exclude: [...shown],
  })
  for (const article of latest.docs) shown.add(article.id)

  // With no curated lead, fall back to the newest story rather than an empty page.
  const heroArticle = lead ?? latest.docs[0] ?? null
  const latestArticles = lead ? latest.docs : latest.docs.slice(1)

  const sections = homepage.categorySections ?? []
  const sectionResults = await Promise.all(
    sections.map(async (section) => {
      const category = section.category
      if (typeof category !== 'object' || category === null) return null

      const result = await getArticlesByCategory(category.id, {
        locale,
        limit: section.limit ?? 4,
        exclude: [...shown],
      })
      return { category: category, heading: section.heading, articles: result.docs }
    }),
  )

  /**
   * The section queries run concurrently against one snapshot of `shown`, so
   * they cannot see each other. Sections are keyed on `primaryCategory` and a
   * story has only one, which makes an overlap unlikely rather than impossible
   * — this pass is what makes it impossible.
   */
  const dedupedSections = sectionResults.map((section) => {
    if (!section) return null
    const articles = section.articles.filter((article) => !shown.has(article.id))
    for (const article of articles) shown.add(article.id)
    return { ...section, articles }
  })

  const mediaEnabled = homepage.mediaSection?.enabled !== false
  const mediaStories = mediaEnabled
    ? (
        await getArticlesByType(['photo-story', 'video-story'], {
          locale,
          limit: homepage.mediaSection?.limit ?? 4,
          exclude: [...shown],
        })
      ).docs
    : []

  /**
   * The front page describes the publication, not one story. Emitting a
   * `NewsArticle` for the lead here would compete with the article's own page
   * for the same URL, so this carries the organisation and the site only.
   */
  const graph = await homeGraph(locale)

  return (
    <div className="space-y-14">
      <JsonLd data={graph} />

      {heroArticle ? (
        <section aria-labelledby="lead-heading">
          <h1 id="lead-heading" className="sr-only">
            {d('latest')}
          </h1>
          <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
            <ArticleCard
              article={heroArticle}
              locale={locale}
              size="lead"
              headingLevel={2}
              priority
            />
            {/*
             * Thumbnail-and-headline in the rail, full cards on narrow screens.
             *
             * Stacked beside the lead, four 16/9 cards run roughly twice its
             * height, and the difference shows up as empty space under the lead
             * headline. Compact rows keep the two columns close enough that the
             * row has no slack to leave behind. Below `lg` the rail is not a
             * rail — it is the next thing down the page — so the pictures come
             * back and the cards are hairline-separated instead.
             */}
            {secondary.length > 0 ? (
              <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1 lg:gap-0">
                {secondary.map((article) => (
                  <li
                    key={article.id}
                    className="lg:border-b lg:border-[var(--color-rule)] lg:py-4 lg:first:pt-0 lg:last:border-0"
                  >
                    <ArticleCard article={article} locale={locale} size="rail" headingLevel={2} />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>
      ) : null}

      {latestArticles.length > 0 ? (
        <section aria-labelledby="latest-heading">
          {/*
            A section marker, not a title bar. The rule runs the full measure
            and the label sits on it in mono at caption size — a section on a
            front page is apparatus telling a reader where they are, and setting
            it as a heavy heading makes it compete with the stories beneath it.
          */}
          <h2
            id="latest-heading"
            className="mb-6 border-t border-[var(--color-rule-strong)] pt-3 font-[family-name:var(--font-mono)] text-xs tracking-widest text-[var(--color-ink-muted)] uppercase"
          >
            {homepage.latestNews?.heading ?? d('latest')}
          </h2>
          <ArticleList articles={latestArticles} locale={locale} />
        </section>
      ) : null}

      {dedupedSections.map((section) =>
        section && section.articles.length > 0 ? (
          <section key={section.category.id} aria-labelledby={`section-${section.category.id}`}>
            <div className="mb-6 flex items-baseline justify-between gap-4 border-t border-[var(--color-rule-strong)] pt-3">
              <h2
                id={`section-${section.category.id}`}
                className="font-[family-name:var(--font-mono)] text-xs tracking-widest text-[var(--color-ink-muted)] uppercase"
              >
                {section.heading ?? section.category.title}
              </h2>
              {section.category.slug ? (
                <Link
                  href={categoryPath(locale, section.category.slug)}
                  className="shrink-0 font-[family-name:var(--font-mono)] text-xs tracking-widest text-[var(--color-brand)] uppercase hover:underline"
                >
                  {d('moreFrom')} {section.category.title}
                </Link>
              ) : null}
            </div>
            <ArticleList articles={section.articles} locale={locale} columns={4} />
          </section>
        ) : null,
      )}

      {picks.length > 0 ? (
        <section aria-labelledby="picks-heading">
          <h2
            id="picks-heading"
            className="mb-6 border-t border-[var(--color-rule-strong)] pt-3 font-[family-name:var(--font-mono)] text-xs tracking-widest text-[var(--color-ink-muted)] uppercase"
          >
            {homepage.editorsPicks?.heading ?? "Editor's picks"}
          </h2>
          <ArticleList articles={picks} locale={locale} columns={3} />
        </section>
      ) : null}

      {mediaStories.length > 0 ? (
        <section aria-labelledby="media-heading">
          <h2
            id="media-heading"
            className="mb-6 border-t border-[var(--color-rule-strong)] pt-3 font-[family-name:var(--font-mono)] text-xs tracking-widest text-[var(--color-ink-muted)] uppercase"
          >
            {homepage.mediaSection?.heading ?? 'Photo & video'}
          </h2>
          <ArticleList articles={mediaStories} locale={locale} columns={4} />
        </section>
      ) : null}
    </div>
  )
}
