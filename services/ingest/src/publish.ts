import { DEFAULT_LOCALE } from '@dhakalive/config'
import { blocksToLexical, slugify, type IngestBlock } from '@dhakalive/core'
import { getLogger } from '@dhakalive/observability'
import type { Payload } from 'payload'

import type { RewriteBlock, RewriteResult } from './rewrite.js'
import { imageFilename, type ArticleDetail } from './source.js'

/**
 * Writes a rewritten story into the CMS and publishes it.
 *
 * Goes through the Local API rather than REST for two reasons that are not
 * preferences. `req.context` flags — the system-transition flag this depends on
 * — exist only on the Local API and are deliberately unreachable from an HTTP
 * body. And the Local API runs inside a transaction, so a story that fails
 * halfway does not leave a published article with no body behind it.
 */

/** Identifies rows this service created. Also the provenance record. */
export const PROVIDER = 'unb'

/**
 * Upstream section name to our category slug.
 *
 * Consulted before anything is created, so a known upstream section attaches to
 * the category that already exists rather than spawning a Bengali-slugged
 * duplicate beside it — `সারাদেশ` should join `bangladesh`, not sit next to it.
 *
 * An unmapped section is created rather than refused, but created inactive. See
 * `ensureCategory`. Adding a line here is still the way to get a section landing
 * in the right place from the first story.
 */
const CATEGORY_MAP: Readonly<Record<string, string>> = {
  সারাদেশ: 'bangladesh',
  বাংলাদেশ: 'bangladesh',
  রাজনীতি: 'politics',
  আন্তর্জাতিক: 'international',
  বিশ্ব: 'international',
  খেলা: 'sports',
  খেলাধুলা: 'sports',
  ক্রিকেট: 'cricket',
  বিনোদন: 'entertainment',
  অর্থনীতি: 'economy',
  ব্যবসা: 'business',
  বাণিজ্য: 'business',
  প্রযুক্তি: 'technology',
  স্বাস্থ্য: 'health',
  শিক্ষা: 'education',
  মতামত: 'opinion',
  জীবনযাপন: 'lifestyle',
  প্রবাস: 'diaspora',
}

/** Byline for automated stories. Must exist before the service is enabled. */
const DESK_AUTHOR_SLUG = 'dhaka-live-desk'

export class PublishSkipped extends Error {
  constructor(
    message: string,
    readonly externalId: string,
  ) {
    super(message)
    this.name = 'PublishSkipped'
  }
}

/**
 * Has this story been ingested already?
 *
 * Runs before the detail fetch and before the model call, because the listing
 * page is mostly unchanged between sweeps and rediscovering that costs a page
 * load and a generation each time.
 */
export async function alreadyIngested(payload: Payload, externalId: string): Promise<boolean> {
  const existing = await payload.count({
    collection: 'articles',
    where: {
      and: [
        { 'source.provider': { equals: PROVIDER } },
        { 'source.externalId': { equals: externalId } },
      ],
    },
    overrideAccess: true,
  })

  return existing.totalDocs > 0
}

/**
 * Finds a category by slug, creating it if it is missing.
 *
 * Created sections are `isActive: false`. That is the whole safety margin on
 * auto-creation: `getNavigationCategories` and `getChildCategories` both filter
 * on `isActive`, so a section invented from an upstream label does not appear in
 * anybody's navigation until an editor turns it on. The article still publishes
 * and its URL still resolves — the section is simply not advertised.
 *
 * Categories are the one taxonomy where a mistake is structural: the slug is
 * part of the article URL, and URLs are forever. Hence the flag, and hence the
 * mapping table still being consulted first.
 */
async function ensureCategory(
  payload: Payload,
  options: { slug: string; title: string; parent?: number; correlationId: string },
): Promise<number> {
  const { slug, title, parent, correlationId } = options

  const find = async (): Promise<number | null> => {
    const found = await payload.find({
      collection: 'categories',
      where: { slug: { equals: slug } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      locale: DEFAULT_LOCALE,
    })
    const id = found.docs[0]?.id
    return typeof id === 'number' ? id : null
  }

  const existing = await find()
  if (existing !== null) return existing

  try {
    const created = await payload.create({
      collection: 'categories',
      data: {
        title,
        slug,
        ...(parent === undefined ? {} : { parent }),
        // Off until a human says otherwise. See the note above.
        isActive: false,
      },
      overrideAccess: true,
      locale: DEFAULT_LOCALE,
      // A section that has just been created has no cached page to purge.
      context: { disableRevalidation: true, correlationId },
    })

    getLogger().warn(
      { correlationId, slug, title },
      'Created a new category from an upstream section — inactive until an editor enables it',
    )

    return created.id as number
  } catch (error) {
    // Most likely a unique violation from a concurrent create. Re-read once.
    const recovered = await find().catch(() => null)
    if (recovered !== null) return recovered

    throw new PublishSkipped(`Could not resolve or create category "${slug}": ${String(error)}`, '')
  }
}

/**
 * Resolves the section a story belongs to.
 *
 * The mapping table is consulted first so that known upstream sections attach to
 * the categories that already exist — `সারাদেশ` should join `bangladesh`, not
 * spawn a Bengali-slugged duplicate beside it. Anything unmapped is created from
 * the upstream label, inactive.
 *
 * `subSection` is threaded through for the case where the source exposes a
 * second level; the listing URL carries only one, so today it is always absent.
 * When a source for it appears, the child is created under its parent here.
 */
async function resolveCategory(
  payload: Payload,
  sourceCategory: string | null,
  correlationId: string,
  subSection?: string | null,
): Promise<number> {
  if (!sourceCategory) throw new PublishSkipped('Story has no source section', '')

  const mapped = CATEGORY_MAP[sourceCategory]
  const slug = mapped ?? slugify(sourceCategory)

  if (!slug) {
    throw new PublishSkipped(`Section "${sourceCategory}" does not produce a usable slug`, '')
  }

  const parent = await ensureCategory(payload, {
    slug,
    title: sourceCategory,
    correlationId,
  })

  if (!subSection) return parent

  const childSlug = slugify(subSection)
  if (!childSlug) return parent

  return ensureCategory(payload, {
    // Prefixed with the parent so two sections may each have a "খেলা" child
    // without colliding on a globally unique slug.
    slug: `${slug}-${childSlug}`,
    title: subSection,
    parent,
    correlationId,
  })
}

async function resolveDeskAuthor(payload: Payload): Promise<number> {
  const found = await payload.find({
    collection: 'authors',
    where: { slug: { equals: DESK_AUTHOR_SLUG } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    locale: DEFAULT_LOCALE,
  })

  const id = found.docs[0]?.id
  if (typeof id !== 'number') {
    throw new PublishSkipped(`Desk author "${DESK_AUTHOR_SLUG}" does not exist`, '')
  }

  return id
}

/** Tags attached to one story. The generator is capped at six; this is the floor. */
const MAX_TAGS = 6

/**
 * Resolves generated tag labels to Tag documents, creating what is missing.
 *
 * Unlike categories, which are refused when unmapped, tags are created freely.
 * The difference is what they cost when wrong: a category determines the URL and
 * a place in navigation, so an invented one is a permanent structural mistake,
 * while a tag is a flat label that an editor can merge or delete later.
 *
 * Nothing here can fail the story. Tags are decoration; an article that
 * published without one of them is fine, an article that did not publish
 * because a taxonomy write failed is not.
 */
async function resolveTags(
  payload: Payload,
  labels: readonly string[],
  correlationId: string,
): Promise<number[]> {
  /**
   * Keyed by slug rather than by the raw label, because that is what the unique
   * constraint is on — two labels differing only in punctuation collapse to one
   * tag, and attempting both would be a guaranteed unique violation.
   */
  const wanted = new Map<string, string>()
  for (const label of labels) {
    const slug = slugify(label)
    if (slug && !wanted.has(slug)) wanted.set(slug, label.trim())
    if (wanted.size >= MAX_TAGS) break
  }

  const ids: number[] = []

  for (const [slug, title] of wanted) {
    try {
      const found = await payload.find({
        collection: 'tags',
        where: { slug: { equals: slug } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        locale: DEFAULT_LOCALE,
      })

      const existing = found.docs[0]?.id
      if (typeof existing === 'number') {
        ids.push(existing)
        continue
      }

      const created = await payload.create({
        collection: 'tags',
        // No slug: `slugField` derives it from the title, and deriving it in one
        // place keeps this consistent with what an editor typing the same label
        // would get.
        data: { title },
        overrideAccess: true,
        locale: DEFAULT_LOCALE,
        // A tag that has just been created has no cached page to purge.
        context: { disableRevalidation: true, correlationId },
      })

      ids.push(created.id as number)
    } catch (error) {
      /**
       * Most likely a unique violation: an editor created the same tag between
       * the lookup and the write. Re-read once — the tag now exists and is
       * exactly what was wanted — and give up on it if that fails too.
       */
      const recovered = await payload
        .find({
          collection: 'tags',
          where: { slug: { equals: slug } },
          limit: 1,
          depth: 0,
          overrideAccess: true,
          locale: DEFAULT_LOCALE,
        })
        .catch(() => null)

      const id = recovered?.docs[0]?.id
      if (typeof id === 'number') {
        ids.push(id)
        continue
      }

      getLogger().warn({ correlationId, err: error, slug }, 'Could not resolve tag, skipping it')
    }
  }

  return ids
}

/**
 * Downloads the source image and stores it as a Media document.
 *
 * The alt text is written at upload time, not afterwards: the publish guards
 * refuse a featured image without it, so an image created first and described
 * later is an image that blocks publication in the window between.
 */
async function uploadImage(
  payload: Payload,
  url: string,
  alt: string,
  signal?: AbortSignal,
): Promise<number> {
  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new PublishSkipped(`Image fetch returned ${response.status}`, '')
  }

  const contentType = response.headers.get('content-type') ?? 'image/jpeg'
  if (!contentType.startsWith('image/')) {
    throw new PublishSkipped(`Image URL served ${contentType}`, '')
  }

  const data = Buffer.from(await response.arrayBuffer())

  const media = await payload.create({
    collection: 'media',
    data: { alt },
    file: { data, mimetype: contentType, name: imageFilename(url), size: data.byteLength },
    overrideAccess: true,
    locale: DEFAULT_LOCALE,
  })

  return media.id as number
}

/**
 * Uploads the pictures the model kept and puts their ids into the body.
 *
 * A failed upload drops that one picture rather than the story: an inline
 * photograph is an illustration, and losing it costs a reader less than losing
 * the report. The featured image is the opposite case, and its upload is
 * deliberately allowed to throw.
 */
async function resolveInlineImages(
  payload: Payload,
  blocks: RewriteBlock[],
  detail: ArticleDetail,
  fallbackAlt: string,
  correlationId: string,
  signal?: AbortSignal,
): Promise<IngestBlock[]> {
  const logger = getLogger().child({ correlationId, externalId: detail.externalId })
  const resolved: IngestBlock[] = []

  for (const block of blocks) {
    if (block.type !== 'pendingImage') {
      resolved.push(block)
      continue
    }

    const image = detail.inlineImages[block.imageIndex]
    if (!image) continue

    // The model's caption is preferred over the source's, which is usually a
    // credit rather than a description.
    const caption = block.caption ?? image.caption

    try {
      // The caption doubles as alt text when there is one. Poor alt, but Media
      // requires a value and an empty one fails the upload outright.
      const mediaId = await uploadImage(payload, image.url, caption ?? fallbackAlt, signal)
      resolved.push({ type: 'image', mediaId, ...(caption ? { caption } : {}) })
    } catch (error) {
      logger.warn(
        { url: image.url, error: error instanceof Error ? error.message : String(error) },
        'Inline image could not be stored; story published without it',
      )
    }
  }

  return resolved
}

export interface PublishOptions {
  payload: Payload
  detail: ArticleDetail
  rewrite: RewriteResult
  correlationId: string
  signal?: AbortSignal
}

/**
 * Creates the article and publishes it in two writes.
 *
 * Two, not one, because `enforceArticleWorkflow` refuses to create anything at a
 * status other than `draft` — whatever the caller asks for, and whoever the
 * caller is. The publish is a transition taken afterwards, which is what makes
 * it appear in `workflowHistory` as an edge rather than as an initial value.
 */
export async function publishIngested(options: PublishOptions): Promise<number> {
  const { payload, detail, rewrite, correlationId, signal } = options
  const logger = getLogger().child({ correlationId, externalId: detail.externalId })

  if (!detail.imageUrl) {
    throw new PublishSkipped(
      'Story has no image, and one is required to publish',
      detail.externalId,
    )
  }

  /**
   * Category and author first, and both before the image is uploaded: they are
   * the two checks that reject a story outright, and failing them after an
   * upload would leave an orphaned Media row behind for every skipped story.
   */
  const [primaryCategory, deskAuthor] = await Promise.all([
    resolveCategory(payload, detail.sourceCategory, correlationId),
    resolveDeskAuthor(payload),
  ])

  const tags = await resolveTags(payload, rewrite.tags, correlationId)

  const featuredImage = await uploadImage(payload, detail.imageUrl, rewrite.imageAlt, signal)

  const body = await resolveInlineImages(
    payload,
    rewrite.blocks,
    detail,
    rewrite.imageAlt,
    correlationId,
    signal,
  )

  const created = await payload.create({
    collection: 'articles',
    data: {
      headline: rewrite.headline,
      subheadline: rewrite.subheadline ?? undefined,
      summary: rewrite.summary,
      body: blocksToLexical(body),
      ...(rewrite.seoTitle || rewrite.seoDescription
        ? {
            seo: {
              ...(rewrite.seoTitle ? { title: rewrite.seoTitle } : {}),
              ...(rewrite.seoDescription ? { description: rewrite.seoDescription } : {}),
            },
          }
        : {}),
      authors: [deskAuthor],
      primaryCategory,
      ...(tags.length > 0 ? { tags } : {}),
      featuredImage,
      articleType: rewrite.articleType,
      workflowStatus: 'draft',
      source: {
        provider: PROVIDER,
        externalId: detail.externalId,
        sourceUrl: detail.url,
        generatedAt: new Date().toISOString(),
      },
    },
    overrideAccess: true,
    locale: DEFAULT_LOCALE,
    /**
     * The create writes nothing publicly visible — the article is a draft — so
     * there is nothing to purge, and letting it queue a revalidation would mean
     * two purges per story where one is correct.
     */
    context: { disableRevalidation: true, correlationId },
  })

  logger.info({ articleId: created.id }, 'Ingested article created as draft')

  await payload.update({
    collection: 'articles',
    id: created.id,
    data: {
      workflowStatus: 'published',
      // The story is stamped with when the source published it, not when the
      // sweep reached it, so ordering does not depend on runner latency.
      publishedAt: detail.publishedAt ?? new Date().toISOString(),
    },
    overrideAccess: true,
    locale: DEFAULT_LOCALE,
    /**
     * No user. `draft → published` exists in the transition table only as a
     * `systemOnly` row, so this flag is the whole authorisation — and it is not
     * reachable from an HTTP request body. The publish guards still run.
     */
    context: { isSystemTransition: true, correlationId },
  })

  logger.info({ articleId: created.id }, 'Ingested article published')

  return created.id as number
}
