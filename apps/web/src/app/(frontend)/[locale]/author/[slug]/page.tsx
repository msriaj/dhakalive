import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { isLocale } from '@dhakalive/config'

import { ArticleList, Pagination } from '../../../../../components/ArticleList'
import { Breadcrumbs } from '../../../../../components/Breadcrumbs'
import { JsonLd } from '../../../../../components/JsonLd'
import { MediaImage } from '../../../../../components/MediaImage'
import { dictionary } from '../../../../../lib/dictionary'
import { buildMetadata } from '../../../../../lib/metadata'
import { getArticlesByAuthor } from '../../../../../lib/queries/articles'
import { getAuthorBySlug } from '../../../../../lib/queries/taxonomy'
import { authorPath } from '../../../../../lib/routes'
import { redirectIfKnown } from '../../../../../lib/redirects'
import { collectionGraph } from '../../../../../lib/seo/structured-data'

export const revalidate = 300

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
  const author = await getAuthorBySlug(decoded, raw)
  if (!author) return {}

  return buildMetadata({
    locale: raw,
    title: author.displayName ?? '',
    description: author.biography,
    path: authorPath(raw, decoded),
    image: author.avatar,
    seo: author.seo,
  })
}

export default async function AuthorPage({ params, searchParams }: RouteParams) {
  const { locale: raw, slug } = await params
  if (!isLocale(raw)) notFound()
  const locale = raw
  const d = dictionary(locale)
  const decoded = decodeURIComponent(slug)
  const page = pageNumber((await searchParams).page)

  const author = await getAuthorBySlug(decoded, locale)
  if (!author) {
    await redirectIfKnown(`/${locale}/author/${decoded}`)
    notFound()
  }

  const articles = await getArticlesByAuthor(author.id, { locale, limit: 12, page })

  /**
   * The author page carries a `Person` alongside its listing. It is the only
   * page that describes the byline itself, so it is where the profile — job
   * title, biography, social profiles — belongs; article markup references the
   * same person by name and URL.
   */
  const graph = await collectionGraph({
    name: author.displayName ?? '',
    description: author.biography,
    path: authorPath(locale, decoded),
    locale,
    crumbs: [{ name: author.displayName ?? '' }],
    author,
  })

  return (
    <div>
      <JsonLd data={graph} />

      <Breadcrumbs locale={locale} crumbs={[{ label: author.displayName ?? '' }]} />

      <header className="mt-4 flex flex-col gap-4 border-b border-[var(--color-rule)] pb-6 sm:flex-row sm:items-center">
        {author.avatar ? (
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full bg-[var(--color-surface-sunken)]">
            <MediaImage media={author.avatar} fill sizes="96px" className="object-cover" />
          </div>
        ) : null}

        <div>
          <h1 className="text-3xl font-bold tracking-tight">{author.displayName}</h1>
          {author.designation ? (
            <p className="mt-1 text-[var(--color-ink-muted)]">{author.designation}</p>
          ) : null}
          {author.biography ? <p className="mt-3 max-w-2xl">{author.biography}</p> : null}
        </div>
      </header>

      <section aria-labelledby="author-articles" className="mt-8">
        <h2 id="author-articles" className="mb-5 text-xl font-bold">
          {d('articlesBy')} {author.displayName}
        </h2>
        <ArticleList articles={articles.docs} locale={locale} />
        <Pagination
          locale={locale}
          basePath={authorPath(locale, decoded)}
          page={articles.page}
          totalPages={articles.totalPages}
        />
      </section>
    </div>
  )
}
