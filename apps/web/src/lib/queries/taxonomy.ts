import 'server-only'

import type { Locale } from '@dhakalive/config'

import type { Author, Category, LiveBlog, Page, Tag } from '../../payload-types'
import { getPayloadClient } from './client'

async function findOneBySlug<T>(
  collection: 'categories' | 'tags' | 'authors' | 'pages' | 'live-blogs',
  slug: string,
  locale: Locale,
  depth = 1,
): Promise<T | null> {
  const payload = await getPayloadClient()
  const result = await payload.find({
    collection,
    locale,
    depth,
    limit: 1,
    where: { slug: { equals: slug } },
    overrideAccess: false,
  })
  return (result.docs[0] as T | undefined) ?? null
}

export function getCategoryBySlug(slug: string, locale: Locale): Promise<Category | null> {
  return findOneBySlug<Category>('categories', slug, locale)
}

export function getTagBySlug(slug: string, locale: Locale): Promise<Tag | null> {
  return findOneBySlug<Tag>('tags', slug, locale)
}

export function getAuthorBySlug(slug: string, locale: Locale): Promise<Author | null> {
  return findOneBySlug<Author>('authors', slug, locale)
}

export function getPageBySlug(slug: string, locale: Locale): Promise<Page | null> {
  return findOneBySlug<Page>('pages', slug, locale)
}

export function getLiveBlogBySlug(slug: string, locale: Locale): Promise<LiveBlog | null> {
  return findOneBySlug<LiveBlog>('live-blogs', slug, locale, 2)
}

/** The subset of a category that navigation and section headers need. */
export type CategorySummary = Pick<Category, 'id' | 'title' | 'slug' | 'displayOrder'>

/** Active top-level sections, in editor-defined order. */
export async function getNavigationCategories(locale: Locale): Promise<CategorySummary[]> {
  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'categories',
    locale,
    depth: 0,
    limit: 50,
    sort: 'displayOrder',
    where: { and: [{ isActive: { equals: true } }, { parent: { exists: false } }] },
    select: { title: true, slug: true, displayOrder: true },
    overrideAccess: false,
  })
  return result.docs
}

/** A top-level section together with its active children, for the navigation. */
export interface CategoryBranch extends CategorySummary {
  children: Pick<Category, 'id' | 'title' | 'slug'>[]
}

/**
 * The navigation tree in two queries rather than one per section.
 *
 * A request per top-level category would be six or more round trips to render
 * a header that is identical for every reader; both halves are fetched flat and
 * joined in memory instead.
 */
export async function getNavigationTree(locale: Locale): Promise<CategoryBranch[]> {
  const payload = await getPayloadClient()
  const parents = await getNavigationCategories(locale)
  if (parents.length === 0) return []

  const result = await payload.find({
    collection: 'categories',
    locale,
    depth: 0,
    limit: 200,
    sort: 'displayOrder',
    where: {
      and: [{ isActive: { equals: true } }, { parent: { in: parents.map((parent) => parent.id) } }],
    },
    select: { title: true, slug: true, parent: true },
    overrideAccess: false,
  })

  const byParent = new Map<number | string, Pick<Category, 'id' | 'title' | 'slug'>[]>()
  for (const child of result.docs) {
    // `depth: 0` leaves the relationship as an id, which is all that is needed.
    const parentId = child.parent
    if (typeof parentId !== 'number' && typeof parentId !== 'string') continue
    const bucket = byParent.get(parentId)
    if (bucket) bucket.push(child)
    else byParent.set(parentId, [child])
  }

  return parents.map((parent) => ({ ...parent, children: byParent.get(parent.id) ?? [] }))
}

/** Child sections of a category, for its landing page. */
export async function getChildCategories(
  parentId: number | string,
  locale: Locale,
): Promise<Pick<Category, 'id' | 'title' | 'slug'>[]> {
  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'categories',
    locale,
    depth: 0,
    limit: 30,
    sort: 'displayOrder',
    where: { and: [{ parent: { equals: parentId } }, { isActive: { equals: true } }] },
    select: { title: true, slug: true },
    overrideAccess: false,
  })
  return result.docs
}

/**
 * Ancestors of a category, nearest first, for breadcrumbs.
 *
 * Bounded by the same depth limit the collection enforces, so a corrupted
 * parent chain cannot loop here even though the write path already refuses to
 * create one.
 */
export async function getCategoryAncestors(
  category: Category,
  locale: Locale,
  maxDepth = 4,
): Promise<Category[]> {
  const payload = await getPayloadClient()
  const ancestors: Category[] = []

  let cursor: unknown = category.parent
  for (let depth = 0; depth < maxDepth; depth += 1) {
    if (cursor === null || cursor === undefined) break

    const id = typeof cursor === 'object' ? (cursor as Category).id : cursor
    const parent = await payload.findByID({
      collection: 'categories',
      id: id as number,
      locale,
      depth: 0,
      overrideAccess: false,
      disableErrors: true,
    })
    if (!parent) break

    ancestors.push(parent)
    cursor = parent.parent
  }

  return ancestors
}

/** Timeline entries for a live blog, newest first, pinned entries hoisted. */
export async function getLiveBlogUpdates(liveBlogId: number | string, locale: Locale, limit = 50) {
  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'live-blog-updates',
    locale,
    depth: 1,
    limit,
    sort: ['-isPinned', '-publishedAt'],
    where: { liveBlog: { equals: liveBlogId } },
    overrideAccess: false,
  })
  return result.docs
}
