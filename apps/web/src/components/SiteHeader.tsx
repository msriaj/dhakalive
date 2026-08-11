import Link from 'next/link'

import { LOCALES, type Locale } from '@dhakalive/config'

import { dictionary } from '../lib/dictionary'
import { getBreakingArticles } from '../lib/queries/articles'
import { getHeader, getSiteSettings } from '../lib/queries/globals'
import { getNavigationTree } from '../lib/queries/taxonomy'
import { articlePath, categoryPath, homePath, searchPath } from '../lib/routes'
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
  const [header, settings, breaking, tree] = await Promise.all([
    getHeader(locale),
    getSiteSettings(locale),
    getBreakingArticles(locale, 5),
    getNavigationTree(locale),
  ])

  const items = (header.primary ?? []) as NavItem[]

  // Only sections that actually have children earn a place in the strip.
  const branches = tree.filter((branch) => branch.children.length > 0)
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
                <li
                  key={`${item.label ?? 'item'}-mobile-${index}`}
                  className="border-b border-[var(--color-rule)] last:border-0"
                >
                  <NavLink
                    item={item}
                    locale={locale}
                    className="block py-4 font-[family-name:var(--font-display)] text-xl font-semibold"
                  />
                </li>
              ))}
            </ul>

            {/*
              The sub-sections again, because the strip above them is desktop
              only — and a phone is where a hidden level of navigation is least
              likely to be discovered by any other route.
            */}
            {branches.length > 0 ? (
              <div className="mt-6 border-t border-[var(--color-rule-strong)] pt-4">
                {branches.map((branch) => (
                  <div key={branch.id} className="mb-5">
                    <p className="font-[family-name:var(--font-mono)] text-[0.6875rem] tracking-widest text-[var(--color-ink-faint)] uppercase">
                      {branch.title}
                    </p>
                    <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                      {branch.children.map((child) =>
                        child.slug ? (
                          <li key={child.id}>
                            <Link
                              href={categoryPath(locale, child.slug)}
                              className="text-base text-[var(--color-ink-muted)]"
                            >
                              {child.title}
                            </Link>
                          </li>
                        ) : null,
                      )}
                    </ul>
                  </div>
                ))}
              </div>
            ) : null}
          </MobileNav>
        </div>
      </div>

      {/*
        Sub-sections, under the masthead rather than inside a hover menu.
        A hover-revealed submenu is unreachable on a phone and invisible to a
        reader who never happens to hover, which for a taxonomy this shallow is
        most of them. Laid flat, the whole tree is legible at a glance — and it
        scrolls horizontally rather than wrapping the header to three lines.
      */}
      {branches.length > 0 ? (
        <div className="hidden border-t border-[var(--color-rule)] md:block">
          <div className="mx-auto max-w-6xl overflow-x-auto px-4">
            <ul className="flex items-center gap-6 py-2 whitespace-nowrap">
              {branches.map((branch) => (
                <li key={branch.id} className="flex items-baseline gap-3">
                  <span className="font-[family-name:var(--font-mono)] text-[0.6875rem] tracking-widest text-[var(--color-ink-faint)] uppercase">
                    {branch.title}
                  </span>
                  {branch.children.map((child) =>
                    child.slug ? (
                      <Link
                        key={child.id}
                        href={categoryPath(locale, child.slug)}
                        className="text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-brand)]"
                      >
                        {child.title}
                      </Link>
                    ) : null,
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {showTicker ? (
        <div className="bg-[var(--color-breaking)] text-[var(--color-on-brand)]">
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
