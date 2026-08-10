import Link from 'next/link'

import { LOCALES, type Locale } from '@dhakalive/config'

import { dictionary } from '../lib/dictionary'
import { getBreakingArticles } from '../lib/queries/articles'
import { getHeader, getSiteSettings } from '../lib/queries/globals'
import { articlePath, homePath, searchPath } from '../lib/routes'
import { MobileNav } from './MobileNav'
import { NavLink, type NavItem } from './NavLink'

function otherLocale(locale: Locale): Locale {
  return LOCALES.find((candidate) => candidate !== locale) ?? locale
}

/**
 * Masthead, primary navigation and the breaking ticker.
 *
 * A server component: the navigation is content, and shipping it as JSON for
 * the client to render would cost a round trip for markup that never changes
 * per user.
 */
export async function SiteHeader({ locale }: { locale: Locale }) {
  const d = dictionary(locale)
  const [header, settings, breaking] = await Promise.all([
    getHeader(locale),
    getSiteSettings(locale),
    getBreakingArticles(locale, 5),
  ])

  const items = (header.primary ?? []) as NavItem[]
  const showTicker = header.showBreakingTicker !== false && breaking.length > 0

  return (
    <header className="border-b border-[var(--color-rule)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href={homePath(locale)} className="text-2xl font-bold tracking-tight">
          {settings.siteName ?? 'DhakaLive'}
        </Link>

        <nav aria-label={d('mainNavigation')} className="hidden md:block">
          <ul className="flex flex-wrap items-center gap-5">
            {items.map((item, index) => (
              <li key={`${item.label ?? 'item'}-${index}`}>
                <NavLink
                  item={item}
                  locale={locale}
                  className="text-sm font-medium hover:text-[var(--color-brand)]"
                />
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href={searchPath(locale)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2 text-sm"
          >
            <span className="sr-only">{d('search')}</span>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" />
            </svg>
          </Link>

          {/* `hrefLang` tells assistive tech and search engines the target language. */}
          <Link
            href={homePath(otherLocale(locale))}
            hrefLang={otherLocale(locale)}
            lang={otherLocale(locale)}
            className="inline-flex min-h-11 items-center rounded-md border border-[var(--color-rule)] px-3 text-sm"
          >
            {d('switchLanguage')}
          </Link>

          <MobileNav
            openLabel={d('openMenu')}
            closeLabel={d('closeMenu')}
            navigationLabel={d('mainNavigation')}
          >
            <ul className="flex flex-col">
              {items.map((item, index) => (
                <li key={`${item.label ?? 'item'}-mobile-${index}`}>
                  <NavLink
                    item={item}
                    locale={locale}
                    className="block px-4 py-3 text-base font-medium"
                  />
                </li>
              ))}
            </ul>
          </MobileNav>
        </div>
      </div>

      {showTicker ? (
        <div className="bg-[var(--color-breaking)] text-white">
          <div className="mx-auto flex max-w-6xl items-center gap-3 overflow-hidden px-4 py-2">
            <span className="shrink-0 rounded-sm bg-white/20 px-2 py-0.5 text-xs font-bold uppercase">
              {header.tickerLabel ?? d('breaking')}
            </span>
            <ul className="flex min-w-0 gap-6">
              {breaking.map((article) => {
                const category = article.primaryCategory
                const categorySlug = typeof category === 'object' ? category?.slug : null
                if (!categorySlug || !article.slug) return null

                return (
                  <li key={article.id} className="truncate">
                    <Link
                      href={articlePath(locale, categorySlug, article.slug)}
                      className="text-sm underline-offset-4 hover:underline"
                    >
                      {article.headline}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      ) : null}
    </header>
  )
}
