import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { isLocale } from '@dhakalive/config'

import { ArticleList, Pagination } from '../../../../../components/ArticleList'
import { Breadcrumbs } from '../../../../../components/Breadcrumbs'
import { JsonLd } from '../../../../../components/JsonLd'
import { buildMetadata } from '../../../../../lib/metadata'
import { getArticlesByTag } from '../../../../../lib/queries/articles'
import { getTagBySlug } from '../../../../../lib/queries/taxonomy'
import { tagPath } from '../../../../../lib/routes'
import { collectionGraph } from '../../../../../lib/seo/structured-data'

export const revalidate = 120

interface RouteParams {
  params: Promise<{ locale: string; slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function pageNumber(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value
  const parsed = Number.parseInt(raw ?? '1', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { locale: raw, slug } = await params
  if (!isLocale(raw)) return {}
  const decoded = decodeURIComponent(slug)
  const tag = await getTagBySlug(decoded, raw)
  if (!tag) return {}

  return buildMetadata({
    locale: raw,
    title: tag.title ?? '',
    description: tag.description,
    path: tagPath(raw, decoded),
    seo: tag.seo,
  })
}

export default async function TagPage({ params, searchParams }: RouteParams) {
  const { locale: raw, slug } = await params
  if (!isLocale(raw)) notFound()
  const locale = raw
  const decoded = decodeURIComponent(slug)
  const page = pageNumber((await searchParams).page)

  const tag = await getTagBySlug(decoded, locale)
  if (!tag) notFound()

  const articles = await getArticlesByTag(tag.id, { locale, limit: 12, page })

  const graph = await collectionGraph({
    name: tag.title ?? '',
    description: tag.description,
    path: tagPath(locale, decoded),
    locale,
    crumbs: [{ name: tag.title ?? '' }],
  })

  return (
    <div>
      <JsonLd data={graph} />

      <Breadcrumbs locale={locale} crumbs={[{ label: tag.title ?? '' }]} />
      <header className="mt-4 border-b border-[var(--color-rule)] pb-4">
        <h1 className="text-3xl font-bold tracking-tight">{tag.title}</h1>
        {tag.description ? (
          <p className="mt-2 text-[var(--color-ink-muted)]">{tag.description}</p>
        ) : null}
      </header>

      <div className="mt-8">
        <ArticleList articles={articles.docs} locale={locale} headingLevel={2} />
        <Pagination
          locale={locale}
          basePath={tagPath(locale, decoded)}
          page={articles.page}
          totalPages={articles.totalPages}
        />
      </div>
    </div>
  )
}
