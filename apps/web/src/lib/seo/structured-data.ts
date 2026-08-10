import 'server-only'

import { DEFAULT_LOCALE, type Locale } from '@dhakalive/config'
import {
  breadcrumbSchema,
  collectionPageSchema,
  graph,
  newsArticleSchema,
  organizationSchema,
  personSchema,
  richTextToPlainText,
  webSiteSchema,
  type BreadcrumbItem,
  type JsonLdNode,
  type PersonInput,
} from '@dhakalive/core'

import type { Article, Author, Category, SiteSetting, Tag } from '../../payload-types'
import { t } from '../dictionary'
import { env } from '../env'
import { articleImages, mediaImage } from '../media'
import { getSiteSettings } from '../queries/globals'
import { absoluteUrl, articlePath, authorPath, homePath, searchPath } from '../routes'

/**
 * Builds structured data from Payload documents.
 *
 * The pure schema.org builders live in `@dhakalive/core`; this is the layer that
 * knows what a Payload `Article` looks like and how to turn one into their
 * inputs. Keeping the two apart is what lets the schema shapes be unit-tested
 * without a database.
 *
 * Every page emits a single `@graph` rather than several script tags, so nodes
 * can reference each other by `@id` — the article points at the organisation
 * that published it instead of describing it again.
 */

/** BCP 47 tags. `bn-BD` and `en-GB` match what `Intl` is given for formatting. */
const LANGUAGE: Record<Locale, string> = {
  bn: 'bn-BD',
  en: 'en-GB',
}

function siteUrl(): string {
  return env().NEXT_PUBLIC_SITE_URL
}

function populated<T extends { id: unknown }>(value: unknown): T | null {
  return typeof value === 'object' && value !== null ? (value as T) : null
}

/**
 * Social profile URLs for `sameAs`.
 *
 * Author profiles store handles for some networks and full URLs for others,
 * because that is what editors paste. A bare handle is expanded; anything that
 * already looks like a URL is passed through, and anything that is neither is
 * dropped rather than emitted as a broken link.
 */
const HANDLE_BASE: Record<string, string> = {
  x: 'https://x.com/',
  facebook: 'https://facebook.com/',
  linkedin: 'https://linkedin.com/in/',
}

function profileUrl(network: keyof typeof HANDLE_BASE, value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/^@/, '')
  if (trimmed.length === 0) return null

  if (/^https?:\/\//i.test(trimmed)) return trimmed
  // A value with a slash or space is neither a handle nor a URL; guessing at it
  // would produce a link to somebody else's profile.
  if (/[\s/]/.test(trimmed)) return null

  return `${HANDLE_BASE[network]}${trimmed}`
}

function authorSameAs(author: Author): string[] {
  const contact = author.contact ?? {}
  const website =
    typeof contact.website === 'string' && /^https?:\/\//i.test(contact.website.trim())
      ? contact.website.trim()
      : null

  return [
    website,
    profileUrl('x', contact.x),
    profileUrl('facebook', contact.facebook),
    profileUrl('linkedin', contact.linkedin),
  ].filter((value): value is string => value !== null)
}

function authorToPerson(author: Author, locale: Locale): PersonInput {
  return {
    name: author.displayName ?? '',
    url: author.slug ? absoluteUrl(authorPath(locale, author.slug), siteUrl()) : null,
    jobTitle: author.designation ?? null,
    description: author.biography ?? null,
    image: mediaImage(author.avatar, ['card', 'thumbnail']),
    sameAs: authorSameAs(author),
  }
}

/**
 * The publisher and the site.
 *
 * Emitted on every page. Both are cheap — one already-cached global read — and
 * a consumer that encounters a `NewsArticle` referencing an organisation it has
 * never seen defined has to guess at the publisher.
 */
export async function siteGraphNodes(locale: Locale): Promise<JsonLdNode[]> {
  const settings: SiteSetting = await getSiteSettings(locale)
  const url = siteUrl()

  const organisation = organizationSchema({
    name: settings.siteName ?? 'DhakaLive',
    url,
    legalName: settings.organization?.legalName ?? null,
    logo: mediaImage(settings.logo, ['og', 'card']),
    sameAs: [
      ...(settings.social ?? []).flatMap((entry) =>
        typeof entry.url === 'string' && entry.url.length > 0 ? [entry.url] : [],
      ),
      ...(settings.organization?.sameAs ?? []).flatMap((entry) =>
        typeof entry.url === 'string' && entry.url.length > 0 ? [entry.url] : [],
      ),
    ],
    foundingDate: settings.organization?.foundingDate ?? null,
    email: settings.contact?.email ?? null,
    telephone: settings.contact?.phone ?? null,
    address: settings.contact?.address ?? null,
  })

  const website = webSiteSchema({
    name: settings.siteName ?? 'DhakaLive',
    url,
    inLanguage: LANGUAGE[locale],
    /**
     * The literal `{search_term_string}` must survive into the output, so the
     * placeholder is appended rather than passed through `searchPath`, which
     * percent-encodes its argument.
     */
    searchUrlTemplate: `${absoluteUrl(searchPath(locale), url)}?q={search_term_string}`,
  })

  return [organisation, website]
}

export interface ArticleGraphInput {
  article: Article
  locale: Locale
  /** Breadcrumb trail, outermost first, excluding the home crumb. */
  crumbs: readonly BreadcrumbItem[]
}

export async function articleGraph(input: ArticleGraphInput): Promise<JsonLdNode> {
  const { article, locale } = input
  const url = siteUrl()

  const category = populated<Category>(article.primaryCategory)
  const path = articlePath(locale, category?.slug ?? 'news', article.slug ?? '')
  const canonical = absoluteUrl(path, url)

  const authors = Array.isArray(article.authors)
    ? article.authors
        .map((entry) => populated<Author>(entry))
        .filter((author): author is Author => author !== null)
        .map((author) => authorToPerson(author, locale))
    : []

  const keywords = Array.isArray(article.tags)
    ? article.tags
        .map((entry) => populated<Tag>(entry))
        .flatMap((tag) => (tag?.title ? [tag.title] : []))
    : []

  /**
   * Word count is derived from the same plain-text extraction the search index
   * uses, so the two never disagree about what counts as body copy. Bengali has
   * no reliable word segmenter in `Intl.Segmenter` for this purpose, so
   * whitespace splitting is used for both languages — approximate, and honest
   * about being approximate rather than wrong in one language only.
   */
  const plainBody = richTextToPlainText(article.body, { maxLength: 60_000 })
  const wordCount = plainBody.length > 0 ? plainBody.split(/\s+/).length : null

  const news = newsArticleSchema({
    headline: article.headline ?? '',
    description: article.summary ?? null,
    url: canonical,
    siteUrl: url,
    images: articleImages(article.featuredImage),
    datePublished: article.publishedAt ?? null,
    dateModified: article.updatedAt,
    authors,
    section: category?.title ?? null,
    keywords,
    inLanguage: LANGUAGE[locale],
    wordCount,
    correction:
      article.correction?.hasCorrection && article.correction.note ? article.correction.note : null,
  })

  const crumbs = breadcrumbSchema([
    { name: t('home', locale), url: absoluteUrl(homePath(locale), url) },
    ...input.crumbs,
  ])

  return graph(...(await siteGraphNodes(locale)), news, crumbs)
}

export interface CollectionGraphInput {
  name: string
  description?: string | null
  path: string
  locale: Locale
  crumbs: readonly BreadcrumbItem[]
  /** Present on author pages: the byline the listing belongs to. */
  author?: Author | null
}

/** Section, tag, author and archive listings. */
export async function collectionGraph(input: CollectionGraphInput): Promise<JsonLdNode> {
  const url = siteUrl()

  const page = collectionPageSchema({
    name: input.name,
    description: input.description ?? null,
    url: absoluteUrl(input.path, url),
    siteUrl: url,
    inLanguage: LANGUAGE[input.locale],
  })

  const crumbs = breadcrumbSchema([
    { name: t('home', input.locale), url: absoluteUrl(homePath(input.locale), url) },
    ...input.crumbs,
  ])

  const person = input.author ? personSchema(authorToPerson(input.author, input.locale)) : null

  return graph(...(await siteGraphNodes(input.locale)), page, person, crumbs)
}

/** The home page: publisher and site only, with no page-level entity of its own. */
export async function homeGraph(locale: Locale = DEFAULT_LOCALE): Promise<JsonLdNode> {
  return graph(...(await siteGraphNodes(locale)))
}
