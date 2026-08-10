import Link from 'next/link'
import { notFound } from 'next/navigation'

import { isLocale } from '@dhakalive/config'

import { ArticleCard } from '../../../components/ArticleCard'
import { ArticleList } from '../../../components/ArticleList'
import { dictionary } from '../../../lib/dictionary'
import {
  getArticlesByCategory,
  getArticlesByType,
  getLatestArticles,
} from '../../../lib/queries/articles'
import { getHomepage } from '../../../lib/queries/globals'
import { categoryPath } from '../../../lib/routes'
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
  const secondary = Array.isArray(homepage.secondaryLeads)
    ? homepage.secondaryLeads
        .map(populatedArticle)
        .filter((entry): entry is Article => entry !== null)
    : []

  // Ids already shown above the fold, so the latest list does not repeat them.
  const shown = [lead?.id, ...secondary.map((entry) => entry.id)].filter(
    (id): id is number => typeof id === 'number',
  )

  const latest = await getLatestArticles({
    locale,
    limit: homepage.latestNews?.limit ?? 10,
    exclude: shown,
  })

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
        exclude: shown,
      })
      return { category: category, heading: section.heading, articles: result.docs }
    }),
  )

  const picks = Array.isArray(homepage.editorsPicks?.articles)
    ? homepage.editorsPicks.articles
        .map(populatedArticle)
        .filter((entry): entry is Article => entry !== null)
    : []

  const mediaEnabled = homepage.mediaSection?.enabled !== false
  const mediaStories = mediaEnabled
    ? (
        await getArticlesByType(['photo-story', 'video-story'], {
          locale,
          limit: homepage.mediaSection?.limit ?? 4,
        })
      ).docs
    : []

  return (
    <div className="space-y-14">
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
            {secondary.length > 0 ? (
              <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1">
                {secondary.map((article) => (
                  <li key={article.id}>
                    <ArticleCard article={article} locale={locale} headingLevel={2} />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>
      ) : null}

      {latestArticles.length > 0 ? (
        <section aria-labelledby="latest-heading">
          <h2
            id="latest-heading"
            className="mb-5 border-b border-[var(--color-rule)] pb-2 text-xl font-bold"
          >
            {homepage.latestNews?.heading ?? d('latest')}
          </h2>
          <ArticleList articles={latestArticles} locale={locale} />
        </section>
      ) : null}

      {sectionResults.map((section) =>
        section && section.articles.length > 0 ? (
          <section key={section.category.id} aria-labelledby={`section-${section.category.id}`}>
            <div className="mb-5 flex items-baseline justify-between border-b border-[var(--color-rule)] pb-2">
              <h2 id={`section-${section.category.id}`} className="text-xl font-bold">
                {section.heading ?? section.category.title}
              </h2>
              {section.category.slug ? (
                <Link
                  href={categoryPath(locale, section.category.slug)}
                  className="text-sm text-[var(--color-brand)]"
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
            className="mb-5 border-b border-[var(--color-rule)] pb-2 text-xl font-bold"
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
            className="mb-5 border-b border-[var(--color-rule)] pb-2 text-xl font-bold"
          >
            {homepage.mediaSection?.heading ?? 'Photo & video'}
          </h2>
          <ArticleList articles={mediaStories} locale={locale} columns={4} />
        </section>
      ) : null}
    </div>
  )
}
