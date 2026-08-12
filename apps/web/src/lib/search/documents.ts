import { PUBLIC_LOCALES, type Locale } from '@dhakalive/config'
import { isPubliclyVisible, richTextToPlainText } from '@dhakalive/core'
import type { SearchDocument } from '@dhakalive/search'
import type { Payload, PayloadRequest } from 'payload'

import { articlePath, pagePath } from '../routes'

/**
 * Turns a document into what the search index stores.
 *
 * The index is denormalised: a result card needs headline, section, byline,
 * image and date, and joining back to five tables per hit is what makes search
 * slow. This is where that flattening happens, and it is the only place that
 * knows the shape of both a Payload document and a `SearchDocument`.
 *
 * Localisation follows the site rather than the database. Payload is configured
 * with `fallback: true`, so a story written only in Bengali still renders on an
 * English route — and it is therefore indexed for English too, carrying the
 * Bengali text. Indexing with `fallbackLocale: false` would produce an index
 * that disagrees with the pages readers actually see.
 */

/**
 * Body text is capped before it reaches the index.
 *
 * Beyond a few thousand characters the marginal relevance of more body text is
 * near zero — the terms are already present — while `tsvector` size, GIN index
 * size and write amplification all keep growing. A long liveblog transcript is
 * the pathological case this exists for.
 */
const MAX_INDEXED_BODY = 12_000

function relationshipTitle(value: unknown, field: string): string | null {
  if (!value || typeof value !== 'object') return null
  const title = (value as Record<string, unknown>)[field]
  return typeof title === 'string' && title.length > 0 ? title : null
}

function relationshipSlug(value: unknown): string | null {
  return relationshipTitle(value, 'slug')
}

function titlesOf(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const title = relationshipTitle(entry, field)
    return title === null ? [] : [title]
  })
}

/**
 * Best URL for a media document.
 *
 * Prefers the `card` size: search results render a small thumbnail, and linking
 * the original means a reader on a phone downloads a 4 MB press photograph to
 * display it at 80 pixels wide.
 */
function imageUrlOf(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const media = value as { url?: unknown; sizes?: Record<string, { url?: unknown }> }

  const card = media.sizes?.card?.url
  if (typeof card === 'string' && card.length > 0) return card

  return typeof media.url === 'string' && media.url.length > 0 ? media.url : null
}

interface LoadOptions {
  payload: Payload
  id: string | number
  req?: PayloadRequest
}

/**
 * Builds the index rows for one article, or returns `[]` when it must not be
 * indexed.
 *
 * The visibility check is made here rather than by the caller so that every
 * path — the publish hook, the scheduled publisher, a full reindex — applies
 * the same rule. An article that is not `published` has no index rows at all,
 * which is what makes de-indexing on unpublish a consequence of the same
 * function rather than a separate code path that could drift.
 */
export async function buildArticleDocuments(options: LoadOptions): Promise<SearchDocument[]> {
  const { payload, id, req } = options
  const documents: SearchDocument[] = []

  for (const locale of PUBLIC_LOCALES) {
    const article = await payload.findByID({
      collection: 'articles',
      id,
      locale,
      // depth 1 resolves category, authors and the featured image — everything
      // a result card renders, and nothing deeper.
      depth: 1,
      overrideAccess: true,
      disableErrors: true,
      ...(req ? { req } : {}),
    })

    if (!article) return []
    if (!isPubliclyVisible(article.workflowStatus)) return []

    const categorySlug = relationshipSlug(article.primaryCategory)
    if (!categorySlug || !article.slug) {
      // Without both, the article has no URL to send a reader to. Publication
      // guards should have caught this; skipping beats indexing a dead link.
      return []
    }

    documents.push({
      collection: 'articles',
      documentId: String(article.id),
      locale,
      url: articlePath(locale, categorySlug, article.slug),
      title: article.headline,
      summary: article.summary ?? null,
      body: richTextToPlainText(article.body, { maxLength: MAX_INDEXED_BODY }),
      section: categorySlug,
      sectionTitle: relationshipTitle(article.primaryCategory, 'title'),
      tags: titlesOf(article.tags, 'title'),
      authors: titlesOf(article.authors, 'displayName'),
      articleType: article.articleType,
      imageUrl: imageUrlOf(article.featuredImage),
      publishedAt: article.publishedAt ?? null,
    })
  }

  return documents
}

/**
 * Standing pages — about, contact, editorial policy.
 *
 * Indexed for the same reason they exist: a reader looking for "contact" should
 * find the contact page, and a search that only covers news is visibly
 * incomplete. Pages have no editorial workflow, so `_status` is the whole rule.
 */
export async function buildPageDocuments(options: LoadOptions): Promise<SearchDocument[]> {
  const { payload, id, req } = options
  const documents: SearchDocument[] = []

  for (const locale of PUBLIC_LOCALES) {
    const page = await payload.findByID({
      collection: 'pages',
      id,
      locale,
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
      ...(req ? { req } : {}),
    })

    if (!page) return []
    if (page._status !== 'published') return []
    if (!page.slug) return []

    documents.push({
      collection: 'pages',
      documentId: String(page.id),
      locale,
      url: pagePath(locale, page.slug),
      title: page.title,
      summary: null,
      body: richTextToPlainText(page.body, { maxLength: MAX_INDEXED_BODY }),
      section: null,
      sectionTitle: null,
      tags: [],
      authors: [],
      articleType: null,
      imageUrl: null,
      publishedAt: page.updatedAt,
    })
  }

  return documents
}

/** Every locale of one document, for removal. */
export function refsFor(collection: string, documentId: string | number) {
  return PUBLIC_LOCALES.map((locale: Locale) => ({
    collection,
    documentId: String(documentId),
    locale,
  }))
}
