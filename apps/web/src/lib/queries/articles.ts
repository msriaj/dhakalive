import 'server-only'

import type { Where } from 'payload'

import type { Locale } from '@dhakalive/config'

import type { Article } from '../../payload-types'
import { getPayloadClient } from './client'

/**
 * Fields a listing card needs. Selecting explicitly keeps the body — by far the
 * largest column — out of queries that render a headline and a thumbnail.
 */
const CARD_SELECT = {
  headline: true,
  subheadline: true,
  slug: true,
  summary: true,
  publishedAt: true,
  articleType: true,
  isBreaking: true,
  featuredImage: true,
  primaryCategory: true,
  authors: true,
} as const

/**
 * What a listing query actually returns.
 *
 * `select` narrows Payload's result type, so a card must not be typed as a full
 * `Article` — that would claim fields (body, workflowStatus, timestamps) the
 * query never asked for, and the first template to read one would get undefined
 * at runtime with no type error.
 */
export type ArticleCardData = Pick<
  Article,
  | 'id'
  | 'headline'
  | 'subheadline'
  | 'slug'
  | 'summary'
  | 'publishedAt'
  | 'articleType'
  | 'isBreaking'
  | 'featuredImage'
  | 'primaryCategory'
  | 'authors'
>

export interface ListOptions {
  locale: Locale
  limit?: number
  page?: number
  /** Ids to leave out, so a lead story is not repeated further down the page. */
  exclude?: (number | string)[]
  /**
   * Population depth, defaulting to 1.
   *
   * A card needs the featured image, the category and the author — all one level
   * down. The commentary blocks also draw the author's *portrait*, which is one
   * level below the author, and asking for it costs an extra join on every row;
   * so it is opt-in per query rather than raised for the whole site.
   */
  depth?: number
  /**
   * Ordering, defaulting to newest first. Always falls back to recency as the
   * final key so that a sort with ties — every unread article shares a view
   * count of zero — still returns a stable, sensible order.
   */
  sort?: string
}

interface ListResult {
  docs: ArticleCardData[]
  totalDocs: number
  totalPages: number
  page: number
}

function excluding(exclude: ListOptions['exclude']): Where | null {
  if (!exclude || exclude.length === 0) return null
  return { id: { not_in: exclude } }
}

function combine(...clauses: (Where | null)[]): Where | undefined {
  const present = clauses.filter((clause): clause is Where => clause !== null)
  if (present.length === 0) return undefined
  if (present.length === 1) return present[0]
  return { and: present }
}

async function listArticles(where: Where | undefined, options: ListOptions): Promise<ListResult> {
  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'articles',
    locale: options.locale,
    // Depth 1 populates the featured image, category and authors — enough for a
    // card, and no further.
    depth: options.depth ?? 1,
    limit: options.limit ?? 12,
    page: options.page ?? 1,
    sort: options.sort ? [options.sort, '-publishedAt'] : '-publishedAt',
    select: CARD_SELECT,
    overrideAccess: false,
    ...(where ? { where } : {}),
  })

  return {
    docs: result.docs,
    totalDocs: result.totalDocs,
    totalPages: result.totalPages,
    page: result.page ?? 1,
  }
}

export function getLatestArticles(options: ListOptions): Promise<ListResult> {
  return listArticles(combine(excluding(options.exclude)), options)
}

export function getArticlesByCategory(
  categoryId: number | string,
  options: ListOptions,
): Promise<ListResult> {
  return listArticles(
    combine({ primaryCategory: { equals: categoryId } }, excluding(options.exclude)),
    options,
  )
}

/**
 * Most read, by the counter `/api/view` keeps.
 *
 * Sorted on `viewCount` and then on recency, which matters more than it looks:
 * a new article and a dozen old ones all sit at zero until somebody reads them,
 * and without the tiebreak the block would show whichever the database happened
 * to return. Falling back to newest makes a cold list read as "latest" rather
 * than as noise.
 */
export function getMostViewedArticles(options: ListOptions): Promise<ListResult> {
  return listArticles(combine(excluding(options.exclude)), { ...options, sort: '-viewCount' })
}

export function getArticlesByTag(
  tagId: number | string,
  options: ListOptions,
): Promise<ListResult> {
  return listArticles(combine({ tags: { contains: tagId } }, excluding(options.exclude)), options)
}

export function getArticlesByAuthor(
  authorId: number | string,
  options: ListOptions,
): Promise<ListResult> {
  return listArticles(
    combine({ authors: { contains: authorId } }, excluding(options.exclude)),
    options,
  )
}

/** Inclusive of `from`, exclusive of `to` — the caller supplies the day boundaries. */
export function getArticlesByDateRange(
  from: Date,
  to: Date,
  options: ListOptions,
): Promise<ListResult> {
  return listArticles(
    combine({
      publishedAt: { greater_than_equal: from.toISOString(), less_than: to.toISOString() },
    }),
    options,
  )
}

export function getArticlesByType(
  types: readonly string[],
  options: ListOptions,
): Promise<ListResult> {
  return listArticles(
    combine({ articleType: { in: [...types] } }, excluding(options.exclude)),
    options,
  )
}

/** Articles flagged as breaking whose flag has not expired. */
export async function getBreakingArticles(locale: Locale, limit = 5): Promise<ArticleCardData[]> {
  const now = new Date().toISOString()
  const result = await listArticles(
    combine({
      and: [
        { isBreaking: { equals: true } },
        { or: [{ breakingUntil: { exists: false } }, { breakingUntil: { greater_than: now } }] },
      ],
    }),
    { locale, limit },
  )
  return result.docs
}

/**
 * A single article by its slug.
 *
 * Returns null rather than throwing so the route can render a 404. Depth 2 is
 * used here — and only here — because the article page renders the author's
 * avatar, which sits one level below the author relationship.
 */
export async function getArticleBySlug(slug: string, locale: Locale): Promise<Article | null> {
  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'articles',
    locale,
    depth: 2,
    limit: 1,
    where: { slug: { equals: slug } },
    overrideAccess: false,
  })
  return result.docs[0] ?? null
}

/**
 * Related stories: same category, excluding the article itself.
 *
 * Deliberately a cheap query rather than a relevance computation — an editor
 * curating "related" belongs in a later phase if it is wanted at all.
 */
export async function getRelatedArticles(
  article: Pick<Article, 'id' | 'primaryCategory'>,
  locale: Locale,
  limit = 4,
): Promise<ArticleCardData[]> {
  const categoryId =
    typeof article.primaryCategory === 'object' && article.primaryCategory !== null
      ? article.primaryCategory.id
      : article.primaryCategory

  if (categoryId === null || categoryId === undefined) return []

  const result = await getArticlesByCategory(categoryId, {
    locale,
    limit,
    exclude: [article.id],
  })
  return result.docs
}

/**
 * The story a reader falls into next, reading down the page.
 *
 * Ordered by publication and taken one at a time rather than as a page: the
 * reader may stop at any point, and fetching five to show one is four articles'
 * worth of body text — the largest column in the table — pulled for nothing.
 *
 * `exclude` carries the ids already on screen. The cursor alone would be enough
 * were `publishedAt` unique, and it is not: the ingest stamps stories with the
 * source's timestamp, so a batch published in the same minute shares one.
 */
export async function getNextArticle(
  before: string,
  locale: Locale,
  exclude: number[],
): Promise<Article | null> {
  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'articles',
    locale,
    // Depth 2, as the article page itself uses: the byline draws the author's
    // portrait, which sits one level below the author relationship.
    depth: 2,
    limit: 1,
    sort: '-publishedAt',
    where: combine({ publishedAt: { less_than_equal: before } }, excluding(exclude)),
    overrideAccess: false,
  })

  return result.docs[0] ?? null
}

/** Slugs for `generateStaticParams`, newest first. */
export async function getRecentArticleParams(
  locale: Locale,
  limit = 200,
): Promise<{ slug: string; categorySlug: string }[]> {
  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'articles',
    locale,
    depth: 1,
    limit,
    sort: '-publishedAt',
    select: { slug: true, primaryCategory: true },
    overrideAccess: false,
  })

  return result.docs.flatMap((doc) => {
    const category = doc.primaryCategory
    const categorySlug =
      typeof category === 'object' && category !== null ? category.slug : undefined
    if (!doc.slug || !categorySlug) return []
    return [{ slug: doc.slug, categorySlug }]
  })
}
