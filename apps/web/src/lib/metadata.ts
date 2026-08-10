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
 * Full structured data (NewsArticle, Breadcrumb, Organization) lands in Phase 7;
 * this covers title, description, canonical, hreflang, Open Graph and Twitter
 * cards.
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
    title,
    description,
    metadataBase: new URL(siteUrl),
    alternates: {
      canonical,
      ...(input.alternates ? { languages: input.alternates } : {}),
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
