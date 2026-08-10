import Link from 'next/link'

import type { Locale } from '@dhakalive/config'

import type { Category, Page } from '../payload-types'
import { categoryPath, pagePath } from '../lib/routes'

/** The shape Payload produces for a navigation entry. */
export interface NavItem {
  label?: string | null
  type?: ('category' | 'page' | 'custom') | null
  category?: number | Category | null
  page?: number | Page | null
  url?: string | null
}

/**
 * Resolves a navigation entry to an href.
 *
 * Returns null when the entry cannot be resolved — an unpopulated relationship,
 * or a category that was deleted. Rendering nothing is better than rendering a
 * link to `/undefined`.
 */
export function navHref(item: NavItem, locale: Locale): string | null {
  if (item.type === 'custom') {
    return typeof item.url === 'string' && item.url.length > 0 ? item.url : null
  }

  if (item.type === 'page') {
    const page = item.page
    return typeof page === 'object' && page?.slug ? pagePath(locale, page.slug) : null
  }

  const category = item.category
  return typeof category === 'object' && category?.slug ? categoryPath(locale, category.slug) : null
}

export function NavLink({
  item,
  locale,
  className,
}: {
  item: NavItem
  locale: Locale
  className?: string
}) {
  const href = navHref(item, locale)
  if (!href || !item.label) return null

  // Absolute URLs leave the site, so they get the usual safety attributes.
  const isExternal = href.startsWith('http')

  if (isExternal) {
    return (
      <a href={href} className={className} rel="noopener noreferrer" target="_blank">
        {item.label}
      </a>
    )
  }

  return (
    <Link href={href} className={className}>
      {item.label}
    </Link>
  )
}
