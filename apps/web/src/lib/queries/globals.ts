import 'server-only'

import type { Locale } from '@dhakalive/config'

import type { Footer, Header, Homepage, SeoDefault, SiteSetting } from '../../payload-types'
import { getPayloadClient } from './client'

/**
 * Globals are read on every request that renders a layout, so each is fetched
 * at the shallowest depth that still resolves what the layout draws.
 */

export async function getSiteSettings(locale: Locale): Promise<SiteSetting> {
  const payload = await getPayloadClient()
  return payload.findGlobal({ slug: 'site-settings', locale, depth: 1, overrideAccess: false })
}

export async function getHeader(locale: Locale): Promise<Header> {
  const payload = await getPayloadClient()
  return payload.findGlobal({ slug: 'header', locale, depth: 1, overrideAccess: false })
}

export async function getFooter(locale: Locale): Promise<Footer> {
  const payload = await getPayloadClient()
  return payload.findGlobal({ slug: 'footer', locale, depth: 1, overrideAccess: false })
}

export async function getHomepage(locale: Locale): Promise<Homepage> {
  const payload = await getPayloadClient()
  /**
   * Depth 2, unlike the other globals.
   *
   * The homepage references articles, and each card needs that article's own
   * category and featured image — one level deeper again. At depth 1 the
   * articles populate but their categories come back as bare ids, and every
   * card silently renders nothing because it cannot build a URL.
   */
  return payload.findGlobal({ slug: 'homepage', locale, depth: 2, overrideAccess: false })
}

export async function getSeoDefaults(locale: Locale): Promise<SeoDefault> {
  const payload = await getPayloadClient()
  return payload.findGlobal({ slug: 'seo-defaults', locale, depth: 1, overrideAccess: false })
}
