import config from '@payload-config'
import { getPayload, type CollectionSlug, type Payload, type Where } from 'payload'
import sharp from 'sharp'

import { DEFAULT_LOCALE, getServerEnv, type Locale } from '@dhakalive/config'
import { type ArticleStatus } from '@dhakalive/core'
import { initLogger, newCorrelationId } from '@dhakalive/observability'

import type { User } from '../payload-types'
import {
  ADVERTISEMENTS,
  ARTICLES,
  AUTHORS,
  CATEGORIES,
  LIVE_BLOG,
  MEDIA,
  PAGES,
  SEED_PASSWORD,
  TAGS,
  USERS,
  type Localized,
  type SeedArticle,
} from './fixtures'
import { body, qa, richText } from './lexical'

/**
 * An interview fixture is built from its exchanges so the seeded body carries
 * bolded questions; everything else is plain paragraphs.
 */
function bodyForArticle(fixture: SeedArticle, locale: Locale) {
  const exchanges = fixture.exchanges?.[locale]
  return exchanges && exchanges.length > 0
    ? richText(...exchanges.map((exchange) => qa(exchange.q, exchange.a)))
    : body(...fixture.paragraphs[locale])
}

/**
 * Idempotent development seed.
 *
 * Run repeatedly: every record is matched on a natural key (email, slug,
 * filename) and updated in place rather than duplicated. Nothing is ever
 * deleted, so local edits to unrelated documents survive a re-seed.
 *
 * Two properties are deliberate and worth keeping:
 *
 * 1. Writes run with `overrideAccess: false` and an explicit actor. The seed
 *    therefore exercises the real access rules and the real workflow transition
 *    table — a permission regression fails the seed instead of hiding until a
 *    human hits it in the admin UI.
 * 2. Articles reach their final status by walking the actual transitions, in
 *    order, as the role entitled to each one. There is no back door that writes
 *    `workflowStatus: 'published'` directly, because no such back door exists in
 *    production either.
 *
 * Lookups use `overrideAccess: true`: they mutate nothing, and idempotency must
 * not depend on whether the current actor happens to be allowed to see a draft.
 */

const env = getServerEnv()

const logger = initLogger({
  level: env.LOG_LEVEL,
  pretty: env.NODE_ENV !== 'production',
  service: 'dhakalive-seed',
  environment: env.NODE_ENV,
  version: env.NEXT_PUBLIC_APP_VERSION,
})

const correlationId = newCorrelationId()

/**
 * Revalidation is suppressed throughout. A seed changes hundreds of documents;
 * letting each one fan out to Next and Cloudflare would be thousands of purges
 * for a data set that is, by definition, not live.
 */
const SEED_CONTEXT = { disableRevalidation: true, correlationId } as const

/** Records created or matched during this run, keyed by fixture key. */
type Registry = Map<string, number>

interface Actors {
  superAdmin: User
  admin: User
  publisher: User
  editor: User
  reporter: User
  contributor: User
}

function idOf(value: unknown): number | null {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object') {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'number') return id
  }
  return null
}

function require<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Seed invariant violated: ${what} was not created`)
  }
  return value
}

function lookup(registry: Registry, key: string, what: string): number {
  const id = registry.get(key)
  if (id === undefined) throw new Error(`Seed invariant violated: unknown ${what} "${key}"`)
  return id
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
}

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString()
}

/**
 * Finds one document by an arbitrary constraint.
 *
 * `draft: true` matters: with versions enabled, a query that does not ask for
 * drafts skips documents that have never been published, and the seed would
 * create a second copy of every draft fixture on its next run.
 */
async function findId(
  payload: Payload,
  collection: CollectionSlug,
  where: Where,
  /**
   * `null` for collections with no localised fields. Passing a locale to one of
   * those makes Payload build a join against a `_locales` table that does not
   * exist, and the query fails deep inside Drizzle with
   * `Cannot read properties of undefined (reading 'referencedTable')`.
   */
  locale: Locale | null,
): Promise<number | null> {
  const result = await payload.find({
    collection,
    where,
    ...(locale ? { locale, fallbackLocale: false } : {}),
    limit: 1,
    depth: 0,
    draft: true,
    overrideAccess: true,
    pagination: false,
  })

  const first = result.docs[0]
  return first ? idOf(first) : null
}

// ---------------------------------------------------------------------- users

/**
 * The very first user is created without an actor.
 *
 * Payload allows that only while the table is empty, and `enforceRoleAssignment`
 * forces the resulting account to `super-admin` rather than trusting the request
 * — so this is the same bootstrap path a real installation takes, not a
 * seed-only shortcut.
 */
async function ensureUsers(payload: Payload): Promise<Actors> {
  const created = new Map<string, User>()

  for (const fixture of USERS) {
    const existingId = await findId(payload, 'users', { email: { equals: fixture.email } }, 'bn')

    // Everyone below the top is created and updated by the super-admin, which
    // the first iteration of this loop has already put in `created`.
    const superAdmin = created.get('super-admin') ?? null

    if (existingId === null) {
      const doc = await payload.create({
        collection: 'users',
        data: {
          email: fixture.email,
          password: SEED_PASSWORD,
          name: fixture.name,
          roles: [fixture.role],
        },
        user: superAdmin,
        overrideAccess: false,
        context: SEED_CONTEXT,
      })
      created.set(fixture.key, doc)
      logger.info({ correlationId, email: fixture.email, role: fixture.role }, 'User created')
      continue
    }

    /**
     * On a re-run the super-admin already exists and is its own actor: it is the
     * only account with nobody above it, and `enforceRoleAssignment` rejects an
     * actor-less write outright — even one that leaves roles untouched. Loading
     * the persisted document first is what gives that write an actor.
     */
    const actor =
      fixture.role === 'super-admin'
        ? await payload.findByID({
            collection: 'users',
            id: existingId,
            depth: 0,
            overrideAccess: true,
          })
        : superAdmin

    /**
     * Re-running resets the name and password so the documented development
     * credentials stay true, but never touches roles: an operator who promoted a
     * local account should not have that undone by a re-seed.
     */
    const doc = await payload.update({
      collection: 'users',
      id: existingId,
      data: { name: fixture.name, password: SEED_PASSWORD },
      user: actor,
      overrideAccess: false,
      context: SEED_CONTEXT,
    })
    created.set(fixture.key, doc)
  }

  const get = (key: string): User => require(created.get(key), `user "${key}"`)

  return {
    superAdmin: get('super-admin'),
    admin: get('admin'),
    publisher: get('publisher'),
    editor: get('editor'),
    reporter: get('reporter'),
    contributor: get('contributor'),
  }
}

// ---------------------------------------------------------------------- media

/**
 * Generates flat-colour JPEGs rather than committing binary fixtures.
 *
 * Keeps the repository free of images nobody reads, and means every seeded
 * asset goes through the real upload path — sharp resizing, EXIF stripping, the
 * R2 adapter when it is configured.
 */
async function ensureMedia(payload: Payload, actors: Actors): Promise<Registry> {
  const registry: Registry = new Map()

  for (const fixture of MEDIA) {
    const existingId = await findId(
      payload,
      'media',
      { filename: { equals: fixture.filename } },
      'bn',
    )

    if (existingId !== null) {
      registry.set(fixture.key, existingId)
      await writeLocalised(payload, 'media', existingId, actors.editor, {
        alt: fixture.alt,
        caption: fixture.caption,
      })
      continue
    }

    const buffer = await sharp({
      create: { width: 1600, height: 900, channels: 3, background: fixture.colour },
    })
      .jpeg({ quality: 80 })
      .toBuffer()

    const doc = await payload.create({
      collection: 'media',
      data: {
        alt: fixture.alt[DEFAULT_LOCALE],
        caption: fixture.caption[DEFAULT_LOCALE],
        credit: fixture.credit,
      },
      file: {
        data: buffer,
        mimetype: 'image/jpeg',
        name: fixture.filename,
        size: buffer.byteLength,
      },
      locale: DEFAULT_LOCALE,
      user: actors.editor,
      overrideAccess: false,
      context: SEED_CONTEXT,
    })

    const id = require(idOf(doc), `media "${fixture.key}"`)
    registry.set(fixture.key, id)
    await writeLocalised(payload, 'media', id, actors.editor, {
      alt: fixture.alt,
      caption: fixture.caption,
    })
    logger.info({ correlationId, filename: fixture.filename }, 'Media uploaded')
  }

  return registry
}

/**
 * Writes the non-default locales of a document.
 *
 * Only localised fields are passed: an update carrying a non-localised field
 * would rewrite it identically in every locale pass, which is harmless but
 * makes the version history unreadable.
 */
async function writeLocalised(
  payload: Payload,
  collection: CollectionSlug,
  id: number,
  actor: User,
  fields: Record<string, Localized<unknown>>,
): Promise<void> {
  for (const locale of ['bn', 'en'] as const) {
    const data: Record<string, unknown> = {}
    for (const [name, values] of Object.entries(fields)) data[name] = values[locale]

    await payload.update({
      collection,
      id,
      data,
      locale,
      user: actor,
      overrideAccess: false,
      context: SEED_CONTEXT,
    })
  }
}

// ------------------------------------------------------------------- taxonomy

async function ensureCategories(payload: Payload, actors: Actors): Promise<Registry> {
  const registry: Registry = new Map()

  // Parents first, so a child's `parent` relationship always resolves.
  const ordered = [...CATEGORIES].sort(
    (a, b) => Number(Boolean(a.parentKey)) - Number(Boolean(b.parentKey)),
  )

  for (const fixture of ordered) {
    const existingId = await findId(payload, 'categories', { slug: { equals: fixture.slug } }, 'bn')
    const parent = fixture.parentKey ? lookup(registry, fixture.parentKey, 'category') : null

    const id =
      existingId ??
      require(idOf(
        await payload.create({
          collection: 'categories',
          data: {
            title: fixture.title[DEFAULT_LOCALE],
            slug: fixture.slug,
            displayOrder: fixture.displayOrder,
            isActive: true,
            ...(parent === null ? {} : { parent }),
          },
          locale: DEFAULT_LOCALE,
          user: actors.editor,
          overrideAccess: false,
          context: SEED_CONTEXT,
        }),
      ), `category "${fixture.key}"`)

    registry.set(fixture.key, id)

    await writeLocalised(payload, 'categories', id, actors.editor, {
      title: fixture.title,
      slug: { bn: fixture.slug, en: fixture.slug },
      description: fixture.description,
    })
  }

  return registry
}

async function ensureTags(payload: Payload, actors: Actors): Promise<Registry> {
  const registry: Registry = new Map()

  for (const fixture of TAGS) {
    const existingId = await findId(payload, 'tags', { slug: { equals: fixture.slug } }, 'bn')

    const id =
      existingId ??
      require(idOf(
        await payload.create({
          collection: 'tags',
          data: { title: fixture.title[DEFAULT_LOCALE], slug: fixture.slug },
          locale: DEFAULT_LOCALE,
          user: actors.editor,
          overrideAccess: false,
          context: SEED_CONTEXT,
        }),
      ), `tag "${fixture.key}"`)

    registry.set(fixture.key, id)
    await writeLocalised(payload, 'tags', id, actors.editor, {
      title: fixture.title,
      slug: { bn: fixture.slug, en: fixture.slug },
    })
  }

  return registry
}

/**
 * Author profiles. The `user` link is administrator-only, so these are written
 * by the admin account rather than by an editor.
 */
async function ensureAuthors(payload: Payload, actors: Actors, media: Registry): Promise<Registry> {
  const registry: Registry = new Map()

  const userIdFor = (key: string | undefined): number | null => {
    if (!key) return null
    const account = (actors as unknown as Record<string, User>)[toCamel(key)]
    return account ? idOf(account) : null
  }

  for (const fixture of AUTHORS) {
    const existingId = await findId(payload, 'authors', { slug: { equals: fixture.slug } }, 'bn')
    const linkedUser = userIdFor(fixture.userKey)

    const id =
      existingId ??
      require(idOf(
        await payload.create({
          collection: 'authors',
          data: {
            displayName: fixture.displayName[DEFAULT_LOCALE],
            slug: fixture.slug,
            isActive: true,
            avatar: lookup(media, 'masthead', 'media'),
            ...(linkedUser === null ? {} : { user: linkedUser }),
          },
          locale: DEFAULT_LOCALE,
          user: actors.admin,
          overrideAccess: false,
          context: SEED_CONTEXT,
        }),
      ), `author "${fixture.key}"`)

    registry.set(fixture.key, id)
    await writeLocalised(payload, 'authors', id, actors.admin, {
      displayName: fixture.displayName,
      designation: fixture.designation,
      biography: fixture.biography,
    })
  }

  return registry
}

/** `super-admin` → `superAdmin`; the fixture keys are kebab-case. */
function toCamel(value: string): string {
  return value.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase())
}

// ------------------------------------------------------------------- articles

/** One authorised step along the path to a fixture's final status. */
interface WorkflowStep {
  to: ArticleStatus
  actor: 'owner' | 'editor' | 'publisher'
}

/**
 * How each resting state is reached, as a sequence of real transitions.
 *
 * Written out rather than searched for: the point is to assert that this exact
 * path is walkable by these exact roles. A future change to the transition table
 * that breaks one of these paths should fail the seed.
 */
const REVIEW_PATH: readonly WorkflowStep[] = [
  { to: 'submitted', actor: 'owner' },
  { to: 'in-review', actor: 'editor' },
]

const APPROVAL_PATH: readonly WorkflowStep[] = [
  ...REVIEW_PATH,
  { to: 'approved', actor: 'publisher' },
]

const WORKFLOW_PATHS: Readonly<Record<ArticleStatus, readonly WorkflowStep[]>> = {
  draft: [],
  submitted: [{ to: 'submitted', actor: 'owner' }],
  'in-review': REVIEW_PATH,
  'changes-requested': [...REVIEW_PATH, { to: 'changes-requested', actor: 'editor' }],
  approved: APPROVAL_PATH,
  scheduled: [...APPROVAL_PATH, { to: 'scheduled', actor: 'publisher' }],
  published: [...APPROVAL_PATH, { to: 'published', actor: 'publisher' }],
  unpublished: [
    ...APPROVAL_PATH,
    { to: 'published', actor: 'publisher' },
    { to: 'unpublished', actor: 'publisher' },
  ],
  // `draft → archived` is a legal edge, so an archived fixture needs no review.
  archived: [{ to: 'archived', actor: 'editor' }],
}

interface ArticleContext {
  actors: Actors
  categories: Registry
  tags: Registry
  authors: Registry
  media: Registry
}

/**
 * The account that owns the draft.
 *
 * Taken from the first byline's linked account, so a contributor-bylined story
 * is genuinely owned by the contributor and the ownership rules on `submit` are
 * exercised rather than bypassed. A wire byline has no account, so the reporter
 * desk owns it.
 */
function ownerFor(fixture: SeedArticle, actors: Actors): User {
  const firstAuthor = AUTHORS.find((author) => author.key === fixture.authorKeys[0])
  const key = firstAuthor?.userKey
  if (!key) return actors.reporter

  const account = (actors as unknown as Record<string, User>)[toCamel(key)]
  return account ?? actors.reporter
}

async function ensureArticles(payload: Payload, context: ArticleContext): Promise<Registry> {
  const registry: Registry = new Map()
  const { actors, categories, tags, authors, media } = context

  for (const fixture of ARTICLES) {
    const owner = ownerFor(fixture, actors)
    const existingId = await findId(
      payload,
      'articles',
      { slug: { equals: fixture.slug[DEFAULT_LOCALE] } },
      DEFAULT_LOCALE,
    )

    const relationships = {
      primaryCategory: lookup(categories, fixture.categoryKey, 'category'),
      tags: fixture.tagKeys.map((key) => lookup(tags, key, 'tag')),
      authors: fixture.authorKeys.map((key) => lookup(authors, key, 'author')),
      featuredImage: lookup(media, fixture.mediaKey, 'media'),
    }

    const id =
      existingId ??
      require(idOf(
        await payload.create({
          collection: 'articles',
          data: {
            headline: fixture.headline[DEFAULT_LOCALE],
            slug: fixture.slug[DEFAULT_LOCALE],
            summary: fixture.summary[DEFAULT_LOCALE],
            body: bodyForArticle(fixture, DEFAULT_LOCALE),
            articleType: fixture.articleType,
            // Always draft: the collection refuses to create anything else,
            // and the status below is reached by transition.
            workflowStatus: 'draft',
            isBreaking: fixture.isBreaking ?? false,
            isFeatured: fixture.isFeatured ?? false,
            ...relationships,
          },
          locale: DEFAULT_LOCALE,
          user: owner,
          overrideAccess: false,
          context: SEED_CONTEXT,
        }),
      ), `article "${fixture.key}"`)

    registry.set(fixture.key, id)

    /**
     * Translations are written by an editor rather than by the owner: once a
     * fixture has been published, its author no longer holds `article:update.own`
     * over it, and a re-run would fail on the second pass.
     */
    for (const locale of ['bn', 'en'] as const) {
      await payload.update({
        collection: 'articles',
        id,
        data: {
          headline: fixture.headline[locale],
          slug: fixture.slug[locale],
          summary: fixture.summary[locale],
          body: bodyForArticle(fixture, locale),
          ...(fixture.subheadline ? { subheadline: fixture.subheadline[locale] } : {}),
          ...(fixture.hasCorrection
            ? {
                correction: {
                  hasCorrection: true,
                  note:
                    locale === 'bn'
                      ? 'একটি সংখ্যা সংশোধন করা হয়েছে। নমুনা তথ্য।'
                      : 'A figure was corrected. Seed data.',
                  correctedAt: daysAgo(1),
                },
              }
            : {}),
        },
        locale,
        user: actors.editor,
        overrideAccess: false,
        context: SEED_CONTEXT,
      })
    }

    await driveWorkflow(payload, id, fixture, actors)
  }

  return registry
}

/**
 * Walks an article from wherever it currently sits to its fixture status.
 *
 * Resumable: on a re-run the article is already at its target and nothing is
 * written. If a human has moved it somewhere off the path, the seed leaves it
 * alone and says so rather than forcing it back.
 */
async function driveWorkflow(
  payload: Payload,
  id: number,
  fixture: SeedArticle,
  actors: Actors,
): Promise<void> {
  const path = WORKFLOW_PATHS[fixture.target]
  if (path.length === 0) return

  const current = await payload.findByID({
    collection: 'articles',
    id,
    depth: 0,
    draft: true,
    overrideAccess: true,
  })

  const status = current.workflowStatus
  if (status === fixture.target) return

  const sequence: ArticleStatus[] = ['draft', ...path.map((step) => step.to)]
  const position = sequence.indexOf(status)

  if (position === -1) {
    logger.warn(
      { correlationId, article: fixture.key, status },
      'Article sits outside its seeded workflow path — leaving it untouched',
    )
    return
  }

  const owner = ownerFor(fixture, actors)

  for (const step of path.slice(position)) {
    const actor =
      step.actor === 'owner' ? owner : step.actor === 'editor' ? actors.editor : actors.publisher

    await payload.update({
      collection: 'articles',
      id,
      data: {
        workflowStatus: step.to,
        workflowNote: `Seed: ${step.actor} moved this to ${step.to}`,
        ...(step.to === 'scheduled'
          ? { scheduledAt: hoursFromNow(fixture.scheduledInHours ?? 2) }
          : {}),
        ...(step.to === 'published' && fixture.publishedDaysAgo !== undefined
          ? { publishedAt: daysAgo(fixture.publishedDaysAgo) }
          : {}),
      },
      locale: DEFAULT_LOCALE,
      user: actor,
      overrideAccess: false,
      context: SEED_CONTEXT,
    })
  }

  logger.info(
    { correlationId, article: fixture.key, from: status, to: fixture.target },
    'Article walked through the workflow',
  )
}

// ---------------------------------------------------------------------- pages

async function ensurePages(payload: Payload, actors: Actors): Promise<Registry> {
  const registry: Registry = new Map()

  for (const fixture of PAGES) {
    const existingId = await findId(payload, 'pages', { slug: { equals: fixture.slug } }, 'bn')

    const id =
      existingId ??
      require(idOf(
        await payload.create({
          collection: 'pages',
          data: {
            title: fixture.title[DEFAULT_LOCALE],
            slug: fixture.slug,
            body: body(...fixture.paragraphs[DEFAULT_LOCALE]),
            showInFooter: fixture.showInFooter,
            _status: 'published',
          },
          locale: DEFAULT_LOCALE,
          user: actors.editor,
          overrideAccess: false,
          context: SEED_CONTEXT,
        }),
      ), `page "${fixture.key}"`)

    registry.set(fixture.key, id)

    for (const locale of ['bn', 'en'] as const) {
      await payload.update({
        collection: 'pages',
        id,
        data: {
          title: fixture.title[locale],
          slug: fixture.slug,
          body: body(...fixture.paragraphs[locale]),
          _status: 'published',
        },
        locale,
        user: actors.editor,
        overrideAccess: false,
        context: SEED_CONTEXT,
      })
    }
  }

  return registry
}

// ----------------------------------------------------------------- live blogs

async function ensureLiveBlog(
  payload: Payload,
  actors: Actors,
  authors: Registry,
  articles: Registry,
): Promise<void> {
  const existingId = await findId(payload, 'live-blogs', { slug: { equals: LIVE_BLOG.slug } }, 'bn')

  const id =
    existingId ??
    require(idOf(
      await payload.create({
        collection: 'live-blogs',
        data: {
          title: LIVE_BLOG.title[DEFAULT_LOCALE],
          slug: LIVE_BLOG.slug,
          summary: LIVE_BLOG.summary[DEFAULT_LOCALE],
          status: 'live',
          authors: LIVE_BLOG.authorKeys.map((key) => lookup(authors, key, 'author')),
          relatedArticle: lookup(articles, LIVE_BLOG.relatedArticleKey, 'article'),
        },
        locale: DEFAULT_LOCALE,
        user: actors.editor,
        overrideAccess: false,
        context: SEED_CONTEXT,
      }),
    ), 'live blog')

  await writeLocalised(payload, 'live-blogs', id, actors.editor, {
    title: LIVE_BLOG.title,
    slug: { bn: LIVE_BLOG.slug, en: LIVE_BLOG.slug },
    summary: LIVE_BLOG.summary,
  })

  for (const update of LIVE_BLOG.updates) {
    /**
     * Entries carry no slug, so the natural key is the parent plus the exact
     * timestamp — which is derived from `minutesAgo` and therefore moves on
     * every run. The stable key is the Bengali headline within this blog.
     */
    const existingUpdateId = await findId(
      payload,
      'live-blog-updates',
      { and: [{ liveBlog: { equals: id } }, { headline: { equals: update.headline.bn } }] },
      'bn',
    )

    const updateId =
      existingUpdateId ??
      require(idOf(
        await payload.create({
          collection: 'live-blog-updates',
          data: {
            liveBlog: id,
            publishedAt: minutesAgo(update.minutesAgo),
            headline: update.headline[DEFAULT_LOCALE],
            content: body(...update.paragraphs[DEFAULT_LOCALE]),
            isPinned: update.isPinned ?? false,
            isCorrection: update.isCorrection ?? false,
          },
          locale: DEFAULT_LOCALE,
          user: actors.editor,
          overrideAccess: false,
          context: SEED_CONTEXT,
        }),
      ), `live blog update "${update.key}"`)

    for (const locale of ['bn', 'en'] as const) {
      await payload.update({
        collection: 'live-blog-updates',
        id: updateId,
        data: {
          headline: update.headline[locale],
          content: body(...update.paragraphs[locale]),
        },
        locale,
        user: actors.editor,
        overrideAccess: false,
        context: SEED_CONTEXT,
      })
    }
  }
}

// ------------------------------------------------------------- advertisements

/**
 * Bookings are written by the publisher: `ads:manage` sits at that rank, and
 * using an editor here would fail the seed's own access check rather than
 * quietly succeeding.
 */
async function ensureAdvertisements(
  payload: Payload,
  actors: Actors,
  media: Registry,
  categories: Registry,
): Promise<Registry> {
  const registry: Registry = new Map()

  for (const fixture of ADVERTISEMENTS) {
    // No localised fields on this collection, so the query carries no locale.
    const existingId = await findId(
      payload,
      'advertisements',
      { name: { equals: fixture.name } },
      null,
    )

    const data = {
      name: fixture.name,
      advertiser: fixture.advertiser,
      placement: fixture.placement,
      image: lookup(media, fixture.mediaKey, 'media'),
      destinationUrl: fixture.destinationUrl,
      weight: fixture.weight,
      isActive: true,
      ...(fixture.categoryKey
        ? { categories: [lookup(categories, fixture.categoryKey, 'category')] }
        : {}),
    }

    const id =
      existingId ??
      require(idOf(
        await payload.create({
          collection: 'advertisements',
          data,
          user: actors.publisher,
          overrideAccess: false,
          context: SEED_CONTEXT,
        }),
      ), `advertisement "${fixture.key}"`)

    if (existingId !== null) {
      await payload.update({
        collection: 'advertisements',
        id,
        data,
        user: actors.publisher,
        overrideAccess: false,
        context: SEED_CONTEXT,
      })
    }

    registry.set(fixture.key, id)
  }

  return registry
}

// -------------------------------------------------------------------- globals

/**
 * Row ids of a previously saved array field, by position.
 *
 * Payload array fields are not themselves localised — only the fields inside
 * them are. Writing the array again for the second locale *without* carrying the
 * row ids across deletes the rows and recreates them, taking the first locale's
 * translations with them. Passing the ids back makes the second pass an update
 * of the same rows, which is what keeps bn and en labels on one entry.
 */
function rowIds(
  rows: readonly { id?: string | null }[] | null | undefined,
): (string | undefined)[] {
  if (!rows) return []
  return rows.map((row) => row.id ?? undefined)
}

async function ensureGlobals(
  payload: Payload,
  actors: Actors,
  registries: {
    categories: Registry
    tags: Registry
    pages: Registry
    articles: Registry
    media: Registry
  },
): Promise<void> {
  const { categories, tags, pages, articles, media } = registries

  const category = (key: string): number => lookup(categories, key, 'category')
  const page = (key: string): number => lookup(pages, key, 'page')
  const article = (key: string): number => lookup(articles, key, 'article')

  const write = async (
    slug: 'homepage' | 'header' | 'footer' | 'site-settings' | 'seo-defaults',
    locale: Locale,
    data: Record<string, unknown>,
    actor: User,
  ): Promise<void> => {
    await payload.updateGlobal({
      slug,
      data,
      locale,
      user: actor,
      overrideAccess: false,
      context: SEED_CONTEXT,
    })
  }

  // ------------------------------------------------------------------ homepage
  const sectionHeading = (key: string, locale: Locale): string =>
    CATEGORIES.find((entry) => entry.key === key)?.title[locale] ?? key

  /**
   * One of each shape, rather than four identical category grids.
   *
   * The seed is what a developer looks at to find out what the front page can
   * do, so it exercises the layout vocabulary — a section lead with an ad rail,
   * a headline grid, a commentary row, a ranked list, a picture strip and a
   * column block — instead of demonstrating one layout four times.
   */
  const COLUMN_KEYS = ['business', 'sports', 'opinion', 'politics'] as const

  const homepageSections: {
    layout: string
    source?: string
    categoryKey?: string
    articleTypes?: string[]
    limit?: number
    showAd?: boolean
    headings?: Localized<string>
    columnKeys?: readonly string[]
  }[] = [
    /*
     * The picture strip runs high, as it does on the dailies this follows: it
     * is the block that most wants stories of its own type, and every block
     * above it takes from the same pool.
     */
    {
      layout: 'photo-strip',
      source: 'type',
      articleTypes: ['photo-story', 'video-story'],
      limit: 4,
      headings: { bn: 'ছবি ও ভিডিও', en: 'Photo and video' },
    },
    {
      layout: 'section-lead',
      source: 'category',
      categoryKey: 'bangladesh',
      limit: 5,
      showAd: true,
    },
    { layout: 'headline-rows', source: 'category', categoryKey: 'politics', limit: 4 },
    {
      layout: 'opinion',
      source: 'type',
      articleTypes: ['opinion', 'editorial'],
      limit: 5,
      headings: { bn: 'মতামত', en: 'Opinion' },
    },
    {
      layout: 'numbered-list',
      source: 'latest',
      limit: 8,
      headings: { bn: 'সবচেয়ে পঠিত', en: 'Most read' },
    },
    {
      layout: 'collection-columns',
      columnKeys: COLUMN_KEYS,
      headings: { bn: 'অন্যান্য', en: 'Elsewhere' },
    },
  ]

  const sectionRow = (
    section: (typeof homepageSections)[number],
    locale: Locale,
    ids?: { id?: string; columnIds?: (string | undefined)[] },
  ): Record<string, unknown> => ({
    ...(ids?.id ? { id: ids.id } : {}),
    layout: section.layout,
    ...(section.source ? { source: section.source } : {}),
    ...(section.categoryKey ? { category: category(section.categoryKey) } : {}),
    ...(section.articleTypes ? { articleTypes: section.articleTypes } : {}),
    ...(section.limit ? { limit: section.limit } : {}),
    ...(section.showAd ? { showAd: true } : {}),
    heading:
      section.headings?.[locale] ??
      (section.categoryKey ? sectionHeading(section.categoryKey, locale) : undefined),
    ...(section.columnKeys
      ? {
          columns: section.columnKeys.map((key, index) => ({
            ...(ids?.columnIds?.[index] ? { id: ids.columnIds[index] } : {}),
            category: category(key),
            heading: sectionHeading(key, locale),
            limit: 3,
          })),
        }
      : {}),
  })

  await write(
    'homepage',
    DEFAULT_LOCALE,
    {
      leadStory: article('budget'),
      /*
       * Four a side. Two left the row ending in a band of white beside a lead
       * twice their depth — the columns are what the shape is for.
       *
       * The side column is hand-picked and the rail runs off a category, so the
       * seed shows both ways of filling a column rather than only the one an
       * editor has to refill every morning.
       */
      side: {
        source: 'manual',
        articles: ['breaking-flood', 'metro', 'filler-1', 'filler-3'].map(article),
      },
      rail: { source: 'category', category: category('business'), limit: 4 },
      subLeads: {
        source: 'manual',
        articles: ['climate-delta', 'editorial-transport', 'interview-economist'].map(article),
      },
      trendingTags: {
        heading: 'আলোচিত বিষয়',
        enabled: true,
        tags: ['election', 'dhaka', 'economy', 'climate', 'cricket', 'transport'].map((key) =>
          lookup(tags, key, 'tag'),
        ),
      },
      latestNews: { heading: 'সর্বশেষ', limit: 8 },
      sections: homepageSections.map((section) => sectionRow(section, DEFAULT_LOCALE)),
      editorsPicks: {
        heading: 'সম্পাদকের পছন্দ',
        articles: ['opinion-rivers'].map(article),
      },
      trending: { heading: 'ট্রেন্ডিং', enabled: true, limit: 5 },
      /*
       * Off, because a photo-strip section above already draws the picture and
       * video stories. Left on, the fixed block would run second and — with
       * every such story already placed — render as an empty heading.
       */
      mediaSection: { heading: 'ছবি ও ভিডিও', enabled: false, limit: 4 },
    },
    actors.editor,
  )

  const savedHomepage = await payload.findGlobal({
    slug: 'homepage',
    locale: DEFAULT_LOCALE,
    depth: 0,
    overrideAccess: true,
  })
  const homepageSectionIds = rowIds(savedHomepage.sections)

  await write(
    'homepage',
    'en',
    {
      trendingTags: { heading: 'Trending topics' },
      latestNews: { heading: 'Latest' },
      sections: homepageSections.map((section, index) =>
        sectionRow(section, 'en', {
          id: homepageSectionIds[index],
          columnIds: rowIds(savedHomepage.sections?.[index]?.columns),
        }),
      ),
      editorsPicks: { heading: "Editor's picks" },
      trending: { heading: 'Trending' },
      mediaSection: { heading: 'Photo and video' },
    },
    actors.editor,
  )

  // -------------------------------------------------------------------- header
  interface NavEntry {
    labels: Localized<string>
    categoryKey?: string
    pageKey?: string
    /** A path or absolute URL, for entries that point off the section tree. */
    url?: string
    children?: NavEntry[]
  }

  const headerNav: NavEntry[] = [
    { labels: { bn: 'বাংলাদেশ', en: 'Bangladesh' }, categoryKey: 'bangladesh' },
    { labels: { bn: 'রাজনীতি', en: 'Politics' }, categoryKey: 'politics' },
    { labels: { bn: 'অর্থনীতি', en: 'Business' }, categoryKey: 'business' },
    {
      labels: { bn: 'খেলা', en: 'Sports' },
      categoryKey: 'sports',
      children: [{ labels: { bn: 'ক্রিকেট', en: 'Cricket' }, categoryKey: 'cricket' }],
    },
    { labels: { bn: 'মতামত', en: 'Opinion' }, categoryKey: 'opinion' },
  ]

  const navRow = (entry: NavEntry, locale: Locale, id?: string): Record<string, unknown> => ({
    ...(id ? { id } : {}),
    label: entry.labels[locale],
    type: entry.categoryKey ? 'category' : entry.pageKey ? 'page' : 'custom',
    ...(entry.categoryKey ? { category: category(entry.categoryKey) } : {}),
    ...(entry.pageKey ? { page: page(entry.pageKey) } : {}),
    ...(entry.url ? { url: entry.url } : {}),
  })

  await write(
    'header',
    DEFAULT_LOCALE,
    {
      primary: headerNav.map((entry) => ({
        ...navRow(entry, DEFAULT_LOCALE),
        children: (entry.children ?? []).map((child) => navRow(child, DEFAULT_LOCALE)),
      })),
      showBreakingTicker: true,
      tickerLabel: 'ব্রেকিং',
    },
    actors.editor,
  )

  const savedHeader = await payload.findGlobal({
    slug: 'header',
    locale: DEFAULT_LOCALE,
    depth: 0,
    overrideAccess: true,
  })
  const headerIds = rowIds(savedHeader.primary)

  await write(
    'header',
    'en',
    {
      primary: headerNav.map((entry, index) => {
        const savedRow = savedHeader.primary?.[index]
        const childIds = rowIds(savedRow?.children)
        return {
          ...navRow(entry, 'en', headerIds[index]),
          children: (entry.children ?? []).map((child, childIndex) =>
            navRow(child, 'en', childIds[childIndex]),
          ),
        }
      }),
      tickerLabel: 'Breaking',
    },
    actors.editor,
  )

  // -------------------------------------------------------------------- footer
  const footerColumns: { headings: Localized<string>; links: NavEntry[] }[] = [
    {
      headings: { bn: 'বিভাগ', en: 'Sections' },
      links: [
        { labels: { bn: 'বাংলাদেশ', en: 'Bangladesh' }, categoryKey: 'bangladesh' },
        { labels: { bn: 'রাজনীতি', en: 'Politics' }, categoryKey: 'politics' },
        { labels: { bn: 'খেলা', en: 'Sports' }, categoryKey: 'sports' },
      ],
    },
    {
      headings: { bn: 'প্রতিষ্ঠান', en: 'The publication' },
      links: [
        { labels: { bn: 'আমাদের সম্পর্কে', en: 'About us' }, pageKey: 'about' },
        { labels: { bn: 'যোগাযোগ', en: 'Contact' }, pageKey: 'contact' },
      ],
    },
  ]

  /** The group's other titles, printed as one row above the footer proper. */
  const footerBrands: NavEntry[] = [
    { labels: { bn: 'কিশোর আলো', en: 'Kishore Alo' }, url: '/bn' },
    { labels: { bn: 'বিজ্ঞানচিন্তা', en: 'Bigyan Chinta' }, url: '/bn' },
    { labels: { bn: 'নাগরিক সংবাদ', en: 'Citizen Journalism' }, url: '/bn' },
    { labels: { bn: 'ইপেপার', en: 'E-paper' }, url: '/bn' },
  ]

  const footerBottom: NavEntry[] = [
    { labels: { bn: 'আমাদের সম্পর্কে', en: 'About us' }, pageKey: 'about' },
    { labels: { bn: 'গোপনীয়তা নীতি', en: 'Privacy policy' }, pageKey: 'privacy' },
    { labels: { bn: 'নীতি ও শর্ত', en: 'Terms' }, pageKey: 'terms' },
    { labels: { bn: 'যোগাযোগ', en: 'Contact' }, pageKey: 'contact' },
  ]

  await write(
    'footer',
    DEFAULT_LOCALE,
    {
      brandLinks: footerBrands.map((link) => navRow(link, DEFAULT_LOCALE)),
      columns: footerColumns.map((column) => ({
        heading: column.headings[DEFAULT_LOCALE],
        links: column.links.map((link) => navRow(link, DEFAULT_LOCALE)),
      })),
      followHeading: 'অনুসরণ করুন',
      apps: {
        heading: 'মোবাইল অ্যাপস ডাউনলোড করুন',
        appStoreUrl: 'https://apps.apple.com/',
        playStoreUrl: 'https://play.google.com/store',
      },
      bottomLinks: footerBottom.map((link) => navRow(link, DEFAULT_LOCALE)),
      copyright: 'ডেইলি লাইভ। নমুনা তথ্য।',
      imprint: 'সম্পাদক ও প্রকাশক: নমুনা সম্পাদক',
    },
    actors.editor,
  )

  const savedFooter = await payload.findGlobal({
    slug: 'footer',
    locale: DEFAULT_LOCALE,
    depth: 0,
    overrideAccess: true,
  })
  const footerIds = rowIds(savedFooter.columns)
  const footerBrandIds = rowIds(savedFooter.brandLinks)
  const footerBottomIds = rowIds(savedFooter.bottomLinks)

  await write(
    'footer',
    'en',
    {
      brandLinks: footerBrands.map((link, index) => navRow(link, 'en', footerBrandIds[index])),
      columns: footerColumns.map((column, index) => {
        const savedColumn = savedFooter.columns?.[index]
        const linkIds = rowIds(savedColumn?.links)
        return {
          ...(footerIds[index] ? { id: footerIds[index] } : {}),
          heading: column.headings.en,
          links: column.links.map((link, linkIndex) => navRow(link, 'en', linkIds[linkIndex])),
        }
      }),
      followHeading: 'Follow us',
      apps: { heading: 'Download the mobile apps' },
      bottomLinks: footerBottom.map((link, index) => navRow(link, 'en', footerBottomIds[index])),
      copyright: 'DhakaLive. Seed data.',
      imprint: 'Editor and publisher: Seed Editor',
    },
    actors.editor,
  )

  // ------------------------------------------------------- settings and SEO
  // `globals:manage.system`, so these two are written by the administrator.
  await write(
    'site-settings',
    DEFAULT_LOCALE,
    {
      siteName: 'ডেইলি লাইভ',
      tagline: 'ঢাকা থেকে সরাসরি',
      logo: lookup(media, 'masthead', 'media'),
      organization: { legalName: 'DhakaLive Media (seed)', foundingDate: daysAgo(3650) },
      contact: {
        email: 'newsroom@dhakalive.test',
        newsroomEmail: 'tips@dhakalive.test',
        address: 'ঢাকা, বাংলাদেশ। নমুনা ঠিকানা।',
      },
      // Placeholder destinations. They exist so the footer's follow band has
      // something to draw; nothing here points at a real account.
      social: [
        { platform: 'facebook', url: 'https://facebook.com/' },
        { platform: 'x', url: 'https://x.com/' },
        { platform: 'youtube', url: 'https://youtube.com/' },
        { platform: 'whatsapp', url: 'https://whatsapp.com/' },
      ],
    },
    actors.admin,
  )

  await write(
    'site-settings',
    'en',
    {
      siteName: 'DhakaLive',
      tagline: 'Live from Dhaka',
      contact: { address: 'Dhaka, Bangladesh. Placeholder address.' },
    },
    actors.admin,
  )

  await write(
    'seo-defaults',
    DEFAULT_LOCALE,
    {
      titleTemplate: '%s — DhakaLive',
      defaultTitle: 'ডেইলি লাইভ',
      defaultDescription: 'ডেভেলপমেন্ট পরিবেশের নমুনা বিবরণ।',
      defaultImage: lookup(media, 'masthead', 'media'),
      // Seeded environments are never production, and a stray crawl of one is
      // a real SEO problem. Indexing stays off until an operator turns it on.
      allowIndexing: false,
    },
    actors.admin,
  )

  await write(
    'seo-defaults',
    'en',
    {
      defaultTitle: 'DhakaLive',
      defaultDescription: 'Placeholder description for a development environment.',
    },
    actors.admin,
  )
}

// ----------------------------------------------------------------------- main

async function main(): Promise<void> {
  if (env.APP_ENV === 'production') {
    throw new Error('Refusing to seed: APP_ENV is production')
  }

  const started = Date.now()
  logger.info({ correlationId, appEnv: env.APP_ENV }, 'Seed starting')

  const payload = await getPayload({ config })

  const actors = await ensureUsers(payload)
  const media = await ensureMedia(payload, actors)
  const categories = await ensureCategories(payload, actors)
  const tags = await ensureTags(payload, actors)
  const authors = await ensureAuthors(payload, actors, media)
  const articles = await ensureArticles(payload, { actors, categories, tags, authors, media })
  const pages = await ensurePages(payload, actors)
  await ensureAdvertisements(payload, actors, media, categories)
  await ensureLiveBlog(payload, actors, authors, articles)
  await ensureGlobals(payload, actors, { categories, tags, pages, articles, media })

  logger.info(
    {
      correlationId,
      ms: Date.now() - started,
      users: USERS.length,
      articles: articles.size,
      categories: categories.size,
    },
    'Seed complete',
  )

  /**
   * The password is deliberately not logged. The logger redacts it anyway — see
   * `REDACT_PATHS` — and a shared development credential belongs in the fixture
   * file where it is version-controlled and reviewable, not in a log stream that
   * may be shipped somewhere.
   */
  logger.info(
    { correlationId, accounts: USERS.map((user) => user.email) },
    'Seeded accounts share the password in src/seed/fixtures.ts (SEED_PASSWORD)',
  )
}

await main()
