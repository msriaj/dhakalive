import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { isLocale } from '@dhakalive/config'

import { ArticleList, Pagination } from '../../../../components/ArticleList'
import { Breadcrumbs } from '../../../../components/Breadcrumbs'
import { JsonLd } from '../../../../components/JsonLd'
import { RichText } from '../../../../components/RichText'
import { buildMetadata } from '../../../../lib/metadata'
import { getArticlesByCategory } from '../../../../lib/queries/articles'
import {
  getCategoryAncestors,
  getCategoryBySlug,
  getChildCategories,
  getPageBySlug,
} from '../../../../lib/queries/taxonomy'
import { env } from '../../../../lib/env'
import { absoluteUrl, categoryPath } from '../../../../lib/routes'
import { redirectIfKnown } from '../../../../lib/redirects'
import { collectionGraph } from '../../../../lib/seo/structured-data'

/**
 * The single-segment route resolves either a category listing or a standing
 * page. Categories are checked first: sections are the high-traffic case, and a
 * page slug that shadows a section would otherwise be ambiguous.
 */
export const revalidate = 120

interface RouteParams {
  params: Promise<{ locale: string; section: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function pageNumber(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value
  const parsed = Number.parseInt(raw ?? '1', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { locale: raw, section: slug } = await params
  if (!isLocale(raw)) return {}
  const locale = raw
  const decoded = decodeURIComponent(slug)

  const category = await getCategoryBySlug(decoded, locale)
  if (category) {
    return buildMetadata({
      locale,
      title: category.title ?? '',
      description: category.description,
      path: categoryPath(locale, decoded),
      seo: category.seo,
    })
  }

  const page = await getPageBySlug(decoded, locale)
  if (!page) return {}

  return buildMetadata({
    locale,
    title: page.title ?? '',
    path: categoryPath(locale, decoded),
    seo: page.seo,
  })
}

export default async function CategoryOrPage({ params, searchParams }: RouteParams) {
  const { locale: raw, section: slug } = await params
  if (!isLocale(raw)) notFound()
  const locale = raw
  const decoded = decodeURIComponent(slug)
  const page = pageNumber((await searchParams).page)

  const category = await getCategoryBySlug(decoded, locale)

  if (category) {
    const [articles, children, ancestors] = await Promise.all([
      getArticlesByCategory(category.id, { locale, limit: 12, page }),
      getChildCategories(category.id, locale),
      getCategoryAncestors(category, locale),
    ])

    const siteUrl = env().NEXT_PUBLIC_SITE_URL
    const ancestorCrumbs = [...ancestors].reverse().flatMap((ancestor) =>
      ancestor.slug
        ? [
            {
              name: ancestor.title ?? '',
              url: absoluteUrl(categoryPath(locale, ancestor.slug), siteUrl),
            },
          ]
        : [],
    )

    const graph = await collectionGraph({
      name: category.title ?? '',
      description: category.description,
      path: categoryPath(locale, decoded),
      locale,
      crumbs: [...ancestorCrumbs, { name: category.title ?? '' }],
    })

    return (
      <div>
        <JsonLd data={graph} />

        <Breadcrumbs
          locale={locale}
          crumbs={[
            // Ancestors come back nearest-first; breadcrumbs read outermost-first.
            ...[...ancestors]
              .reverse()
              .flatMap((ancestor) =>
                ancestor.slug
                  ? [{ label: ancestor.title ?? '', href: categoryPath(locale, ancestor.slug) }]
                  : [],
              ),
            { label: category.title ?? '' },
          ]}
        />

        <header className="mt-4 border-b border-[var(--color-rule)] pb-4">
          <h1 className="text-3xl font-bold tracking-tight">{category.title}</h1>
          {category.description ? (
            <p className="mt-2 text-[var(--color-ink-muted)]">{category.description}</p>
          ) : null}
        </header>

        {children.length > 0 ? (
          <nav aria-label={category.title ?? ''} className="mt-4">
            <ul className="flex flex-wrap gap-2">
              {children.map((child) =>
                child.slug ? (
                  <li key={child.id}>
                    <a
                      href={categoryPath(locale, child.slug)}
                      className="inline-flex min-h-9 items-center rounded-full border border-[var(--color-rule)] px-3 text-sm"
                    >
                      {child.title}
                    </a>
                  </li>
                ) : null,
              )}
            </ul>
          </nav>
        ) : null}

        <div className="mt-8">
          <ArticleList articles={articles.docs} locale={locale} headingLevel={2} />
          <Pagination
            locale={locale}
            basePath={categoryPath(locale, decoded)}
            page={articles.page}
            totalPages={articles.totalPages}
          />
        </div>
      </div>
    )
  }

  const standingPage = await getPageBySlug(decoded, locale)
  if (!standingPage) {
    // Neither a section nor a page. It may be an old URL that has moved.
    await redirectIfKnown(`/${locale}/${decoded}`)
    notFound()
  }

  return (
    <article className="mx-auto max-w-3xl">
      <Breadcrumbs locale={locale} crumbs={[{ label: standingPage.title ?? '' }]} />
      <h1 className="mt-4 text-3xl font-bold tracking-tight">{standingPage.title}</h1>
      <RichText data={standingPage.body} className="prose-article mt-6 space-y-5 leading-relaxed" />
    </article>
  )
}
