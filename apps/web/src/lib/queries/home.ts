import 'server-only'

import type { Locale } from '@dhakalive/config'

import type { Category, Homepage, Tag } from '../../payload-types'
import { categoryPath, tagPath } from '../routes'
import {
  getArticlesByCategory,
  getArticlesByType,
  getLatestArticles,
  getMostViewedArticles,
  type ArticleCardData,
} from './articles'

type SectionConfig = NonNullable<Homepage['sections']>[number]

/**
 * The layout vocabulary, taken from the global's own generated type so the
 * renderer and the CMS cannot drift apart: add a layout to the select and the
 * renderer stops compiling until it handles it.
 */
export type SectionLayout = SectionConfig['layout']

export interface HomeColumn {
  key: string
  heading: string | null
  href: string | null
  articles: ArticleCardData[]
}

export interface HomeSection {
  key: string
  layout: SectionLayout
  heading: string | null
  /** Where the heading links to — a category, or nowhere for a manual block. */
  href: string | null
  showAd: boolean
  /** Passed to the ad selector, so a section rail can carry section-targeted bookings. */
  categoryId: number | null
  articles: ArticleCardData[]
  columns: HomeColumn[]
}

export interface HomeTopic {
  key: string
  title: string
  href: string
}

export interface HomeComposition {
  lead: ArticleCardData | null
  side: ArticleCardData[]
  rail: ArticleCardData[]
  subLeads: ArticleCardData[]
  topics: HomeTopic[]
  latest: ArticleCardData[]
  sections: HomeSection[]
  picks: ArticleCardData[]
  media: ArticleCardData[]
}

/**
 * Commentary blocks draw the columnist's portrait, which sits one level below
 * the author relationship. Everything else stops at depth 1.
 */
const DEPTH_BY_LAYOUT: Partial<Record<SectionLayout, number>> = { opinion: 2 }

/** The only layout that reads a set of sub-collections rather than one list. */
const COLUMN_LAYOUT: SectionLayout = 'collection-columns'

function populated<T>(value: unknown): T | null {
  return typeof value === 'object' && value !== null ? (value as T) : null
}

function populatedList<T>(value: unknown): T[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is T => typeof entry === 'object' && entry !== null)
}

/**
 * A running record of which stories the page has already used.
 *
 * One story, one place on the page. Curated slots are claimed first and queried
 * ones fill in around them: an editor who put a story in the lead, the rail or
 * a hand-picked block chose that placement, and a query result should not be
 * able to take it.
 */
class Placed {
  private readonly ids = new Set<number>()

  get size(): number {
    return this.ids.size
  }

  /** Ids to pass to a query's `exclude`. */
  get list(): number[] {
    return [...this.ids]
  }

  /** Keeps the first `limit` stories not already placed, and claims them. */
  take(articles: ArticleCardData[], limit: number): ArticleCardData[] {
    const kept: ArticleCardData[] = []
    for (const article of articles) {
      if (kept.length >= limit) break
      if (this.ids.has(article.id)) continue
      this.ids.add(article.id)
      kept.push(article)
    }
    return kept
  }

  /** Claims a curated list whole, less anything already placed or repeated. */
  claim(articles: ArticleCardData[]): ArticleCardData[] {
    return this.take(articles, articles.length)
  }
}

/**
 * Section queries are issued concurrently, so none of them can see what the
 * others returned. Each therefore over-fetches by the number of stories already
 * on the page, and the surplus is discarded when the results are folded back in
 * page order — which is what makes one story appearing in two blocks impossible
 * rather than merely unlikely.
 *
 * Capped, because the headroom is bounded by how much duplication is plausible
 * and an unbounded `limit` on a front page is how a query starts reading the
 * whole table.
 */
function headroom(limit: number, placed: Placed): number {
  return Math.min(limit + placed.size, 60)
}

/**
 * One column of the lead assembly.
 *
 * The three columns share a shape, and it is deliberately the section block's
 * shape minus the layouts: a column is drawn one way, but it is filled the same
 * four ways a section is.
 */
type SlotConfig = NonNullable<Homepage['side']>

/** A slot or a section, fetched but not yet claimed. */
interface Fetched {
  /** Already claimed — a hand-picked list, resolved before any query ran. */
  final: ArticleCardData[] | null
  articles: ArticleCardData[]
  limit: number
}

function isManual(source: string | null | undefined): boolean {
  // Rows that predate the source field have none, and were hand-picked.
  return (source ?? 'manual') === 'manual'
}

async function fetchSlot(
  slot: SlotConfig | undefined,
  locale: Locale,
  placed: Placed,
  manual: ArticleCardData[] | null,
): Promise<Fetched> {
  const limit = slot?.limit ?? 4
  const exclude = placed.list

  if (isManual(slot?.source)) return { final: manual ?? [], articles: [], limit }

  if (slot?.source === 'category') {
    const category = populated<Category>(slot.category)
    if (!category) return { final: [], articles: [], limit }
    const result = await getArticlesByCategory(category.id, {
      locale,
      limit: headroom(limit, placed),
      exclude,
    })
    return { final: null, articles: result.docs, limit }
  }

  if (slot?.source === 'most-viewed') {
    const result = await getMostViewedArticles({
      locale,
      limit: headroom(limit, placed),
      exclude,
    })
    return { final: null, articles: result.docs, limit }
  }

  if (slot?.source === 'type') {
    const types = slot.articleTypes ?? []
    if (types.length === 0) return { final: [], articles: [], limit }
    const result = await getArticlesByType(types, {
      locale,
      limit: headroom(limit, placed),
      exclude,
    })
    return { final: null, articles: result.docs, limit }
  }

  const result = await getLatestArticles({ locale, limit: headroom(limit, placed), exclude })
  return { final: null, articles: result.docs, limit }
}

/** One section's rows, over-fetched and not yet deduplicated. */
interface FetchedSection extends Fetched {
  columns: {
    key: string
    heading: string | null
    href: string | null
    articles: ArticleCardData[]
    limit: number
  }[]
}

const EMPTY_FETCH: FetchedSection = { final: [], articles: [], limit: 0, columns: [] }

/**
 * Reads a section's stories. Deliberately free of any claiming: the fetch phase
 * runs concurrently, and letting it mutate the placed set would make the page's
 * composition depend on which query happened to resolve first.
 */
async function fetchSection(
  section: SectionConfig,
  locale: Locale,
  placed: Placed,
  manual: ArticleCardData[] | null,
): Promise<FetchedSection> {
  const depth = DEPTH_BY_LAYOUT[section.layout]
  const limit = section.limit ?? 6
  const exclude = placed.list

  if (section.layout === COLUMN_LAYOUT) {
    const columns = await Promise.all(
      (section.columns ?? []).map(async (column, index) => {
        const category = populated<Category>(column.category)
        if (!category) return null

        const columnLimit = column.limit ?? 3
        const result = await getArticlesByCategory(category.id, {
          locale,
          limit: headroom(columnLimit, placed),
          exclude,
          depth,
        })

        return {
          key: column.id ?? `${category.id}-${index}`,
          heading: column.heading ?? category.title ?? null,
          href: category.slug ? categoryPath(locale, category.slug) : null,
          articles: result.docs,
          limit: columnLimit,
        }
      }),
    )

    return {
      final: null,
      articles: [],
      limit,
      columns: columns.filter((column): column is NonNullable<typeof column> => column !== null),
    }
  }

  switch (section.source) {
    // Already populated by the global's own query, and claimed before the
    // queries ran — no second round trip.
    case 'manual':
      return { final: manual ?? [], articles: [], limit, columns: [] }

    case 'latest': {
      const result = await getLatestArticles({
        locale,
        limit: headroom(limit, placed),
        exclude,
        depth,
      })
      return { final: null, articles: result.docs, limit, columns: [] }
    }

    case 'most-viewed': {
      const result = await getMostViewedArticles({
        locale,
        limit: headroom(limit, placed),
        exclude,
        depth,
      })
      return { final: null, articles: result.docs, limit, columns: [] }
    }

    case 'type': {
      const types = section.articleTypes ?? []
      if (types.length === 0) return EMPTY_FETCH
      const result = await getArticlesByType(types, {
        locale,
        limit: headroom(limit, placed),
        exclude,
        depth,
      })
      return { final: null, articles: result.docs, limit, columns: [] }
    }

    default: {
      const category = populated<Category>(section.category)
      if (!category) return EMPTY_FETCH
      const result = await getArticlesByCategory(category.id, {
        locale,
        limit: headroom(limit, placed),
        exclude,
        depth,
      })
      return { final: null, articles: result.docs, limit, columns: [] }
    }
  }
}

/**
 * Turns the homepage global into the exact lists the page renders.
 *
 * Kept out of the route so that the page component is markup and this is data:
 * the ordering rules — curated before queried, first placement wins — are the
 * part that is easy to get wrong, and here they are testable.
 */
export async function composeHomepage(
  homepage: Homepage,
  locale: Locale,
): Promise<HomeComposition> {
  const placed = new Placed()

  const lead = populated<ArticleCardData>(homepage.leadStory)
  const claimedLead = lead ? placed.claim([lead])[0] : undefined

  /*
   * Hand-picked slots and blocks are resolved in page order before anything is
   * queried, so that every later query already excludes them. Doing it inside
   * the concurrent fetch would let a query claim a story an editor had named.
   */
  const slotConfigs = [homepage.side, homepage.rail, homepage.subLeads]
  const manualBySlot = slotConfigs.map((slot) =>
    isManual(slot?.source) ? placed.claim(populatedList<ArticleCardData>(slot?.articles)) : null,
  )

  /*
   * A disabled picks block releases its stories rather than holding them: they
   * are not being printed there, so nothing below should be denied them.
   */
  const picks =
    homepage.editorsPicks?.enabled === false
      ? []
      : placed.claim(populatedList<ArticleCardData>(homepage.editorsPicks?.articles))

  const sectionConfigs = homepage.sections ?? []
  const manualBySection = sectionConfigs.map((section) =>
    section.layout !== COLUMN_LAYOUT && section.source === 'manual'
      ? placed.claim(populatedList<ArticleCardData>(section.articles))
      : null,
  )

  const latestLimit = homepage.latestNews?.limit ?? 10
  const latestResult = await getLatestArticles({
    locale,
    limit: headroom(latestLimit, placed),
    exclude: placed.list,
  })

  /*
   * With no curated lead, the newest story becomes it rather than leaving the
   * page headless — and then it must not also head the latest list.
   */
  const heroArticle = claimedLead ?? placed.take(latestResult.docs, 1)[0] ?? null
  const latest = placed.take(latestResult.docs, latestLimit)

  const [fetchedSlots, fetched] = await Promise.all([
    Promise.all(
      slotConfigs.map((slot, index) =>
        fetchSlot(slot, locale, placed, manualBySlot[index] ?? null),
      ),
    ),
    Promise.all(
      sectionConfigs.map((section, index) =>
        fetchSection(section, locale, placed, manualBySection[index] ?? null),
      ),
    ),
  ])

  /*
   * The columns are folded before the sections, and left to right: the side
   * column keeps a story the rail also matched, and both keep one a section
   * below would have taken. Higher on the page wins.
   */
  const [side, rail, subLeads] = fetchedSlots.map(
    (slot) => slot.final ?? placed.take(slot.articles, slot.limit),
  )

  const sections: HomeSection[] = []
  sectionConfigs.forEach((section, index) => {
    const result = fetched[index]
    if (!result) return

    // Folded in page order, so the block a reader meets first keeps a story two
    // blocks would otherwise both run.
    const articles = result.final ?? placed.take(result.articles, result.limit)
    const columns = result.columns
      .map((column) => ({
        key: column.key,
        heading: column.heading,
        href: column.href,
        articles: placed.take(column.articles, column.limit),
      }))
      .filter((column) => column.articles.length > 0)

    if (articles.length === 0 && columns.length === 0) return

    const category = populated<Category>(section.category)
    sections.push({
      key: section.id ?? `section-${index}`,
      layout: section.layout,
      heading: section.showHeading === false ? null : (section.heading ?? category?.title ?? null),
      href: category?.slug ? categoryPath(locale, category.slug) : null,
      showAd: section.showAd === true,
      categoryId: category?.id ?? null,
      articles,
      columns,
    })
  })

  const mediaEnabled = homepage.mediaSection?.enabled !== false
  const mediaLimit = homepage.mediaSection?.limit ?? 4
  const media = mediaEnabled
    ? placed.take(
        (
          await getArticlesByType(['photo-story', 'video-story'], {
            locale,
            limit: headroom(mediaLimit, placed),
            exclude: placed.list,
          })
        ).docs,
        mediaLimit,
      )
    : []

  const topics: HomeTopic[] =
    homepage.trendingTags?.enabled === false
      ? []
      : populatedList<Tag>(homepage.trendingTags?.tags).flatMap((tag) =>
          tag.slug && tag.title
            ? [{ key: String(tag.id), title: tag.title, href: tagPath(locale, tag.slug) }]
            : [],
        )

  return {
    lead: heroArticle,
    side: side ?? [],
    rail: rail ?? [],
    subLeads: subLeads ?? [],
    topics,
    latest,
    sections,
    picks,
    media,
  }
}
