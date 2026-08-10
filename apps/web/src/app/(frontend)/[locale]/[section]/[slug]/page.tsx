import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { DEFAULT_LOCALE, LOCALES, isLocale } from '@dhakalive/config'

import { ArticleList } from '../../../../../components/ArticleList'
import { Breadcrumbs } from '../../../../../components/Breadcrumbs'
import { Byline } from '../../../../../components/Byline'
import { MediaImage } from '../../../../../components/MediaImage'
import { RichText } from '../../../../../components/RichText'
import { ShareLinks } from '../../../../../components/ShareLinks'
import { dictionary } from '../../../../../lib/dictionary'
import { env } from '../../../../../lib/env'
import { formatDate, isoDate } from '../../../../../lib/format'
import { buildMetadata } from '../../../../../lib/metadata'
import { getArticleBySlug, getRelatedArticles } from '../../../../../lib/queries/articles'
import { absoluteUrl, articlePath, categoryPath, tagPath } from '../../../../../lib/routes'
import type { Category, Tag } from '../../../../../payload-types'

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
  if (!article) notFound()

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
  const tags = Array.isArray(article.tags)
    ? article.tags.filter((tag): tag is Tag => typeof tag === 'object' && tag !== null)
    : []

  const shareUrl = absoluteUrl(
    articlePath(locale, category?.slug ?? 'news', article.slug ?? decodedSlug),
    env().NEXT_PUBLIC_SITE_URL,
  )

  return (
    <article className="mx-auto max-w-3xl">
      {category?.slug ? (
        <Breadcrumbs
          locale={locale}
          crumbs={[
            { label: category.title ?? '', href: categoryPath(locale, category.slug) },
            { label: article.headline ?? '' },
          ]}
        />
      ) : null}

      <header className="mt-4">
        {article.isBreaking ? (
          <p className="mb-2 inline-block rounded-sm bg-[var(--color-breaking)] px-2 py-0.5 text-xs font-bold text-white uppercase">
            {d('breaking')}
          </p>
        ) : null}

        <h1 className="text-3xl leading-tight font-bold tracking-tight md:text-4xl">
          {article.headline}
        </h1>

        {article.subheadline ? (
          <p className="mt-3 text-lg text-[var(--color-ink-muted)]">{article.subheadline}</p>
        ) : null}

        <div className="mt-5">
          <Byline article={article} locale={locale} />
        </div>
      </header>

      {article.featuredImage ? (
        <figure className="mt-6">
          <div className="relative aspect-[16/9] overflow-hidden rounded-md bg-[var(--color-surface-sunken)]">
            <MediaImage
              media={article.featuredImage}
              fill
              priority
              sizes="(min-width: 768px) 768px, 100vw"
              className="object-cover"
            />
          </div>
          {/*
            Credit renders independently of caption. Photographers and wire
            agencies must be attributed whether or not an editor wrote a caption,
            so nesting the credit inside the caption check would silently drop
            attribution on most images.
          */}
          {typeof article.featuredImage === 'object' &&
          (article.featuredImage.caption || article.featuredImage.credit) ? (
            <figcaption className="mt-2 text-sm text-[var(--color-ink-muted)]">
              {article.featuredImage.caption}
              {article.featuredImage.credit ? (
                <span className={article.featuredImage.caption ? 'ml-2 opacity-80' : 'opacity-80'}>
                  {article.featuredImage.credit}
                </span>
              ) : null}
            </figcaption>
          ) : null}
        </figure>
      ) : null}

      {article.correction?.hasCorrection && article.correction.note ? (
        <aside
          aria-labelledby="correction-heading"
          className="mt-6 rounded-md border-l-4 border-[var(--color-brand)] bg-[var(--color-surface-sunken)] p-4"
        >
          <h2 id="correction-heading" className="text-sm font-bold uppercase">
            {d('correction')}
          </h2>
          <p className="mt-1 text-sm">{article.correction.note}</p>
          {article.correction.correctedAt ? (
            <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
              <time dateTime={isoDate(article.correction.correctedAt)}>
                {formatDate(article.correction.correctedAt, locale)}
              </time>
            </p>
          ) : null}
        </aside>
      ) : null}

      <RichText
        data={article.body}
        className="prose-article mt-8 space-y-5 text-lg leading-relaxed"
      />

      {tags.length > 0 ? (
        <section aria-labelledby="tags-heading" className="mt-10">
          <h2 id="tags-heading" className="mb-2 text-sm font-semibold uppercase">
            {d('tags')}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {tags.map((tag) =>
              tag.slug ? (
                <li key={tag.id}>
                  <Link
                    href={tagPath(locale, tag.slug)}
                    className="inline-flex min-h-9 items-center rounded-full border border-[var(--color-rule)] px-3 text-sm hover:border-[var(--color-brand)]"
                  >
                    {tag.title}
                  </Link>
                </li>
              ) : null,
            )}
          </ul>
        </section>
      ) : null}

      <div className="mt-8 border-t border-[var(--color-rule)] pt-6">
        <ShareLinks url={shareUrl} title={article.headline ?? ''} locale={locale} />
      </div>

      {related.length > 0 ? (
        <section aria-labelledby="related-heading" className="mt-14">
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
  )
}
