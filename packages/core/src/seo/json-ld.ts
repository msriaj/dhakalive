/**
 * schema.org structured data.
 *
 * Pure builders: they take plain values and return plain objects. Nothing here
 * knows about Payload, Next or React, which is what makes the output assertable
 * in a unit test — and structured data is worth testing, because it is invisible
 * in the browser and wrong output is only discovered weeks later in Search
 * Console.
 *
 * Two rules run through all of it:
 *
 * 1. **Absolute URLs everywhere.** Relative URLs are silently ignored by
 *    consumers, so callers pass absolute ones and these builders never
 *    construct paths.
 * 2. **Undefined over empty.** A property with no value is omitted rather than
 *    emitted as `null` or `""`; a present-but-empty property reads as an
 *    assertion that the value is genuinely blank.
 */

export const SCHEMA_CONTEXT = 'https://schema.org'

/** A JSON-LD node. Deliberately loose — the shape is the schema, not the type. */
export type JsonLdNode = Record<string, unknown>

/** Drops keys whose value is undefined, null, an empty string or an empty array. */
function compact(node: Record<string, unknown>): JsonLdNode {
  const result: JsonLdNode = {}

  for (const [key, value] of Object.entries(node)) {
    if (value === undefined || value === null) continue
    if (typeof value === 'string' && value.trim().length === 0) continue
    if (Array.isArray(value) && value.length === 0) continue
    result[key] = value
  }

  return result
}

export interface ImageInput {
  url: string
  width?: number | null
  height?: number | null
}

function imageObject(image: ImageInput): JsonLdNode {
  return compact({
    '@type': 'ImageObject',
    url: image.url,
    width: image.width ?? undefined,
    height: image.height ?? undefined,
  })
}

export interface OrganizationInput {
  /** Publication name as readers know it. */
  name: string
  /** Site root, absolute. */
  url: string
  legalName?: string | null
  logo?: ImageInput | null
  /** Profile URLs — Wikipedia, Wikidata, official social accounts. */
  sameAs?: readonly string[]
  foundingDate?: string | null
  email?: string | null
  telephone?: string | null
  address?: string | null
}

/**
 * The publisher.
 *
 * `@id` is stable and derived from the site URL so that every other node can
 * reference the same organisation instead of repeating it. Consumers treat two
 * inline organisations with the same name as two organisations.
 */
export function organizationId(siteUrl: string): string {
  return `${siteUrl.replace(/\/$/, '')}/#organization`
}

export function organizationSchema(input: OrganizationInput): JsonLdNode {
  return compact({
    '@type': 'NewsMediaOrganization',
    '@id': organizationId(input.url),
    name: input.name,
    legalName: input.legalName ?? undefined,
    url: input.url,
    logo: input.logo ? imageObject(input.logo) : undefined,
    sameAs: input.sameAs ? [...input.sameAs] : undefined,
    foundingDate: input.foundingDate ?? undefined,
    email: input.email ?? undefined,
    telephone: input.telephone ?? undefined,
    address: input.address ?? undefined,
  })
}

export interface WebSiteInput {
  name: string
  url: string
  /** Absolute search URL with `{search_term_string}` where the query goes. */
  searchUrlTemplate?: string | null
  inLanguage?: string | null
}

export function webSiteId(siteUrl: string): string {
  return `${siteUrl.replace(/\/$/, '')}/#website`
}

/**
 * The site itself, plus the sitelinks search box when a search URL is given.
 *
 * `SearchAction` is what lets a search engine offer a search field for the site
 * in its results. The template must be an absolute URL containing the literal
 * `{search_term_string}`.
 */
export function webSiteSchema(input: WebSiteInput): JsonLdNode {
  return compact({
    '@type': 'WebSite',
    '@id': webSiteId(input.url),
    name: input.name,
    url: input.url,
    inLanguage: input.inLanguage ?? undefined,
    publisher: { '@id': organizationId(input.url) },
    potentialAction: input.searchUrlTemplate
      ? {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: input.searchUrlTemplate,
          },
          'query-input': 'required name=search_term_string',
        }
      : undefined,
  })
}

export interface PersonInput {
  name: string
  /** Absolute URL of the author's profile page. */
  url?: string | null
  jobTitle?: string | null
  description?: string | null
  image?: ImageInput | null
  sameAs?: readonly string[]
  email?: string | null
}

export function personSchema(input: PersonInput): JsonLdNode {
  return compact({
    '@type': 'Person',
    name: input.name,
    url: input.url ?? undefined,
    jobTitle: input.jobTitle ?? undefined,
    description: input.description ?? undefined,
    image: input.image ? imageObject(input.image) : undefined,
    sameAs: input.sameAs ? [...input.sameAs] : undefined,
    email: input.email ?? undefined,
  })
}

export interface BreadcrumbItem {
  name: string
  /** Absolute URL. Omitted on the final crumb, which is the current page. */
  url?: string | null
}

/**
 * Breadcrumbs.
 *
 * `position` is one-based and must be contiguous. The last item deliberately
 * carries no `item`: it is the page being viewed, and pointing it at itself is
 * what produces the "breadcrumb links to itself" warning.
 */
export function breadcrumbSchema(items: readonly BreadcrumbItem[]): JsonLdNode | null {
  if (items.length === 0) return null

  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) =>
      compact({
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
        item: index === items.length - 1 ? undefined : (item.url ?? undefined),
      }),
    ),
  }
}

export interface NewsArticleInput {
  headline: string
  description?: string | null
  /** Canonical, absolute. */
  url: string
  images?: readonly ImageInput[]
  datePublished?: string | null
  dateModified?: string | null
  authors?: readonly PersonInput[]
  /** Primary section name, as a reader sees it. */
  section?: string | null
  keywords?: readonly string[]
  inLanguage?: string | null
  siteUrl: string
  /**
   * Behind a paywall? Google requires this to be explicit for news, and the
   * honest default for a free site is `true`.
   */
  isAccessibleForFree?: boolean
  /** Word count, when it is cheap to compute. */
  wordCount?: number | null
  /** Correction notice text, if the story carries one. */
  correction?: string | null
}

/**
 * A news story.
 *
 * `headline` is truncated at 110 characters because Google rejects longer ones
 * outright — losing the tail of a headline is better than losing the whole
 * structured-data block.
 */
const MAX_HEADLINE_LENGTH = 110

export function newsArticleSchema(input: NewsArticleInput): JsonLdNode {
  const headline =
    input.headline.length > MAX_HEADLINE_LENGTH
      ? `${input.headline.slice(0, MAX_HEADLINE_LENGTH - 1).trimEnd()}…`
      : input.headline

  return compact({
    '@type': 'NewsArticle',
    '@id': `${input.url}#article`,
    headline,
    description: input.description ?? undefined,
    url: input.url,
    // `mainEntityOfPage` is what tells a consumer this markup describes the page
    // it is on, rather than an article merely mentioned by it.
    mainEntityOfPage: { '@type': 'WebPage', '@id': input.url },
    image: input.images?.map(imageObject),
    datePublished: input.datePublished ?? undefined,
    // Falls back to the publication date: omitting `dateModified` is read as
    // "never updated", which for a corrected story is wrong.
    dateModified: input.dateModified ?? input.datePublished ?? undefined,
    author: input.authors?.map(personSchema),
    publisher: { '@id': organizationId(input.siteUrl) },
    articleSection: input.section ?? undefined,
    keywords: input.keywords ? [...input.keywords] : undefined,
    inLanguage: input.inLanguage ?? undefined,
    isAccessibleForFree: input.isAccessibleForFree ?? true,
    wordCount: input.wordCount ?? undefined,
    correction: input.correction ?? undefined,
  })
}

export interface CollectionPageInput {
  name: string
  description?: string | null
  url: string
  siteUrl: string
  inLanguage?: string | null
}

/** Section, tag, author and archive listings. */
export function collectionPageSchema(input: CollectionPageInput): JsonLdNode {
  return compact({
    '@type': 'CollectionPage',
    name: input.name,
    description: input.description ?? undefined,
    url: input.url,
    inLanguage: input.inLanguage ?? undefined,
    isPartOf: { '@id': webSiteId(input.siteUrl) },
  })
}

/**
 * Combines nodes into one `@graph` document.
 *
 * One script tag with a graph, rather than several tags: nodes can then
 * reference each other by `@id` — an article pointing at the organisation that
 * published it — which is what stops consumers treating each block as a separate
 * unrelated entity.
 */
export function graph(...nodes: (JsonLdNode | null | undefined)[]): JsonLdNode {
  return {
    '@context': SCHEMA_CONTEXT,
    '@graph': nodes.filter((node): node is JsonLdNode => Boolean(node)),
  }
}
