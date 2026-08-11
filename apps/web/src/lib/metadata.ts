import 'server-only'

import type { Metadata } from 'next'

import type { Locale } from '@dhakalive/config'

import type { Media } from '../payload-types'
import { getSeoDefaults } from './queries/globals'
import { absoluteUrl } from './routes'
import { env } from './env'

/**
 * Builds page metadata from a document's SEO overrides, falling back to the SEO
 * defaults global and then to the content itself.
 *
 * This covers title, description, canonical, hreflang, Open Graph and Twitter
 * cards. schema.org structured data is built separately in `lib/seo` — it
 * describes entities rather than the document, and Next's Metadata API has no
 * representation for it.
 */

export interface SeoOverrides {
  title?: string | null
  description?: string | null
  image?: number | Media | null
  canonicalUrl?: string | null
  noIndex?: boolean | null
}

export interface MetadataInput {
  locale: Locale
  /** Page title before the site template is applied. */
  title: string
  /**
   * Skips the root layout's `%s — DhakaLive` template.
   *
   * For the front page the title already *is* the masthead, so the template
   * turns it into "DhakaLive — DhakaLive" — which is what every search result
   * and shared link for the home page then shows.
   */
  absoluteTitle?: boolean
  description?: string | null
  path: string
  /** Absolute URLs keyed by locale, plus `x-default`. */
  alternates?: Record<string, string>
  image?: unknown
  seo?: SeoOverrides | null
  type?: 'website' | 'article'
  publishedTime?: string | null
  modifiedTime?: string | null
  /** Set for pages that must never be indexed: search, previews, archives. */
  noIndex?: boolean
}

function imageUrl(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const media = value as Media
  if (typeof media.url !== 'string') return null

  // Prefer the Open Graph crop when it exists.
  const og = media.sizes?.og?.url
  return typeof og === 'string' ? og : media.url
}

export async function buildMetadata(input: MetadataInput): Promise<Metadata> {
  const defaults = await getSeoDefaults(input.locale)
  const siteUrl = env().NEXT_PUBLIC_SITE_URL

  const title = input.seo?.title ?? input.title
  const description =
    input.seo?.description ?? input.description ?? defaults.defaultDescription ?? undefined

  const canonical = input.seo?.canonicalUrl ?? absoluteUrl(input.path, siteUrl)

  const ogImage =
    imageUrl(input.seo?.image) ?? imageUrl(input.image) ?? imageUrl(defaults.defaultImage)

  // Any one of three switches suppresses indexing: the document, the caller, or
  // a site-wide setting used to keep staging out of search results.
  const noIndex =
    input.seo?.noIndex === true || input.noIndex === true || defaults.allowIndexing === false

  return {
    title: input.absoluteTitle ? { absolute: title } : title,
    description,
    metadataBase: new URL(siteUrl),
    alternates: {
      canonical,
      ...(input.alternates ? { languages: input.alternates } : {}),
      /**
       * Feed autodiscovery, on every page rather than only the home page.
       * Readers and browser extensions look at whatever page the user happens
       * to be on, and Next replaces `alternates` wholesale when a child route
       * sets it — so declaring these once in a layout would lose them on every
       * page that has a canonical URL, which is all of them.
       */
      types: {
        'application/rss+xml': [
          { url: absoluteUrl(`/${input.locale}/rss.xml`, siteUrl), title: 'RSS' },
        ],
        'application/atom+xml': [
          { url: absoluteUrl(`/${input.locale}/atom.xml`, siteUrl), title: 'Atom' },
        ],
      },
    },
    robots: noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true, 'max-image-preview': 'large' },
    openGraph: {
      type: input.type ?? 'website',
      title,
      description: description ?? undefined,
      url: canonical,
      locale: input.locale === 'bn' ? 'bn_BD' : 'en_GB',
      siteName: defaults.defaultTitle ?? 'DhakaLive',
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
      ...(input.type === 'article'
        ? {
            publishedTime: input.publishedTime ?? undefined,
            modifiedTime: input.modifiedTime ?? undefined,
          }
        : {}),
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title,
      description: description ?? undefined,
      ...(defaults.twitterHandle ? { site: defaults.twitterHandle } : {}),
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  }
}
