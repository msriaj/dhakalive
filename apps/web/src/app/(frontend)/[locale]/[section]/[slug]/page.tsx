import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { DEFAULT_LOCALE, LOCALES, isLocale } from '@dhakalive/config'

import { layoutForType, specForLayout } from '../../../../../lib/article-layout'
import { ArticleBody } from '../../../../../components/ArticleBody'
import { ArticleList } from '../../../../../components/ArticleList'
import { ArticleStream } from '../../../../../components/ArticleStream'
import { JsonLd } from '../../../../../components/JsonLd'
import { ViewCounter } from '../../../../../components/ViewCounter'
import { dictionary } from '../../../../../lib/dictionary'
import { env } from '../../../../../lib/env'
import { buildMetadata } from '../../../../../lib/metadata'
import { getArticleBySlug, getRelatedArticles } from '../../../../../lib/queries/articles'
import { redirectIfKnown } from '../../../../../lib/redirects'
import { articleGraph } from '../../../../../lib/seo/structured-data'
import { absoluteUrl, articlePath, categoryPath, homePath } from '../../../../../lib/routes'
import type { Category } from '../../../../../payload-types'
import { loadNextArticle } from './next-article'

/**
 * Article page.
 *
 * Statically generated for the most recent stories and incrementally
 * regenerated every five minutes; publishing or editing triggers an on-demand
 * revalidation (Phase 5) so the time-based window is only a safety net.
 */
export const revalidate = 300
export const dynamicParams = true

interface RouteParams {
  params: Promise<{ locale: string; section: string; slug: string }>
}

function categoryOf(article: { primaryCategory?: unknown }): Category | null {
  const value = article.primaryCategory
  return typeof value === 'object' && value !== null ? (value as Category) : null
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { locale: raw, slug } = await params
  if (!isLocale(raw)) return {}
  const locale = raw

  // Route params arrive percent-encoded, and every slug here may be Bengali.
  const decodedSlug = decodeURIComponent(slug)
  const article = await getArticleBySlug(decodedSlug, locale)
  if (!article) return {}

  const category = categoryOf(article)
  const path = articlePath(locale, category?.slug ?? 'news', article.slug ?? decodedSlug)

  // The slug is localised, so an alternate only exists where a translation does.
  const alternates: Record<string, string> = {}
  const siteUrl = env().NEXT_PUBLIC_SITE_URL
  for (const candidate of LOCALES) {
    const translated = await getArticleBySlug(decodedSlug, candidate)
    if (!translated?.slug) continue
    const translatedCategory = categoryOf(translated)
    alternates[candidate] = absoluteUrl(
      articlePath(candidate, translatedCategory?.slug ?? 'news', translated.slug),
      siteUrl,
    )
  }

  // Tells search engines which version to serve for unmatched languages.
  const defaultAlternate = alternates[DEFAULT_LOCALE]
  if (defaultAlternate) alternates['x-default'] = defaultAlternate

  return buildMetadata({
    locale,
    title: article.headline ?? '',
    description: article.summary,
    path,
    alternates,
    image: article.featuredImage,
    seo: article.seo,
    type: 'article',
    publishedTime: article.publishedAt,
    modifiedTime: article.updatedAt,
  })
}

export default async function ArticlePage({ params }: RouteParams) {
  const { locale: raw, section: sectionSlug, slug } = await params
  if (!isLocale(raw)) notFound()
  const locale = raw
  const d = dictionary(locale)

  const decodedSlug = decodeURIComponent(slug)
  const article = await getArticleBySlug(decodedSlug, locale)
  if (!article) {
    // The story may simply have moved. Checked only here, on the path that was
    // already going to fail, so a reader following a live URL never pays for it.
    await redirectIfKnown(`/${locale}/${decodeURIComponent(sectionSlug)}/${decodedSlug}`)
    notFound()
  }

  const category = categoryOf(article)

  /**
   * The category segment is part of the canonical URL, so a request that
   * reaches the right article through the wrong section is redirected rather
   * than served — two URLs for one story is a duplicate-content problem.
   */
  if (category?.slug && category.slug !== decodeURIComponent(sectionSlug)) {
    redirect(articlePath(locale, category.slug, article.slug ?? decodedSlug))
  }

  const related = await getRelatedArticles(article, locale)

  /**
   * Structured data mirrors the visible breadcrumb trail rather than being
   * assembled separately. Google warns when the two disagree, and two sources
   * of truth for the same trail is exactly how they come to disagree.
   */
  const graph = await articleGraph({
    article,
    locale,
    crumbs: [
      ...(category?.slug
        ? [
            {
              name: category.title ?? '',
              url: absoluteUrl(categoryPath(locale, category.slug), env().NEXT_PUBLIC_SITE_URL),
            },
          ]
        : []),
      { name: article.headline ?? '' },
    ],
  })

  const layout = layoutForType(article.articleType)
  const spec = specForLayout(layout)

  return (
    <>
      <article>
        <JsonLd data={graph} />
        <ViewCounter articleId={article.id} />
        <ArticleBody article={article} locale={locale} />

        {related.length > 0 ? (
          <section aria-labelledby="related-heading" className={`mx-auto ${spec.container} mt-14`}>
            <h2
              id="related-heading"
              className="mb-5 border-b border-[var(--color-rule)] pb-2 text-xl font-bold"
            >
              {d('relatedStories')}
            </h2>
            <ArticleList articles={related} locale={locale} columns={2} />
          </section>
        ) : null}
      </article>

      {/*
        The stream sits outside the article element, not inside it: each story
        it appends is its own `<article>`, and nesting them would say that the
        next report is part of this one.
      */}
      <div>
        <ArticleStream
          locale={locale}
          cursor={article.publishedAt ?? null}
          seed={article.id}
          loadNext={loadNextArticle}
          moreHref={category?.slug ? categoryPath(locale, category.slug) : homePath(locale)}
          moreLabel={category?.title ? `${d('moreFrom')} ${category.title}` : d('backToHome')}
          nextLabel={d('nextStory')}
          loadingLabel={d('loadingNextStory')}
          endLabel={d('endOfStream')}
        />
      </div>
    </>
  )
}
