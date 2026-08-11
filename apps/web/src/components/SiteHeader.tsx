import Link from 'next/link'

import type { Locale } from '@dhakalive/config'

import { dictionary } from '../lib/dictionary'
import { getBreakingArticles } from '../lib/queries/articles'
import { getHeader, getSiteSettings } from '../lib/queries/globals'
import { getNavigationTree } from '../lib/queries/taxonomy'
import { articlePath, homePath, searchPath } from '../lib/routes'
import { SearchIcon } from './icons'
import { MobileNav } from './MobileNav'
import { NavLink, navHref, type NavItem } from './NavLink'
import { NavAccordion, NavDropdown, type SubCategory } from './SubNav'

/**
 * Masthead, primary navigation and the breaking ticker.
 *
 * Two bands rather than one, which is how every Bengali daily sets its front
 * page and is not only convention: the masthead and eleven section names cannot
 * share a line without one of them being squeezed, and it was the sections that
 * were losing — they sat in 14px type between the logo and the search button,
 * and on anything narrower than a laptop they disappeared into a hamburger
 * entirely. Given their own band they are readable, and on a phone they scroll
 * sideways instead of hiding.
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

  /**
   * Sub-sections are attached to the navigation entry that points at their
   * parent, keyed on category id.
   *
   * The primary navigation is editor-defined and may hold pages and external
   * links as well as sections, so the tree is looked up per entry rather than
   * replacing the navigation with the category list — an entry the editor chose
   * to leave out should stay out.
   */
  const childrenByCategory = new Map(
    tree
      .filter((branch) => branch.children.length > 0)
      .map((branch) => [branch.id, branch.children]),
  )

  function subsectionsFor(item: NavItem): SubCategory[] {
    if (item.type !== 'category') return []
    const category = item.category
    const id = typeof category === 'object' ? category?.id : category
    return (id !== null && id !== undefined ? childrenByCategory.get(id) : undefined) ?? []
  }

  const showTicker = header.showBreakingTicker !== false && breaking.length > 0

  return (
    <header>
      {/* The masthead band: the name, and the two controls that are not sections. */}
      <div className="border-b border-[var(--color-rule)]">
        <div className="mx-auto flex max-w-[78rem] items-center gap-4 px-4 py-4">
          <MobileNav
            openLabel={d('openMenu')}
            closeLabel={d('closeMenu')}
            navigationLabel={d('mainNavigation')}
          >
            <ul className="flex flex-col">
              {items.map((item, index) => {
                const subsections = subsectionsFor(item)
                const href = navHref(item, locale)

                return (
                  <li
                    key={`${item.label ?? 'item'}-mobile-${index}`}
                    className="border-b border-[var(--color-rule)] last:border-0"
                  >
                    {subsections.length > 0 && href && item.label ? (
                      <NavAccordion
                        label={item.label}
                        href={href}
                        locale={locale}
                        expandLabel={d('showSubsections')}
                      >
                        {subsections}
                      </NavAccordion>
                    ) : (
                      <NavLink
                        item={item}
                        locale={locale}
                        className="block py-4 font-[family-name:var(--font-display)] text-xl font-semibold"
                      />
                    )}
                  </li>
                )
              })}
            </ul>
          </MobileNav>

          {/*
            Centred on a phone, where it is flanked by the menu and the search
            button; left on a wide screen, where centring it would leave the
            masthead floating in the middle of an otherwise left-aligned page.
          */}
          <Link
            href={homePath(locale)}
            className="flex-1 text-center font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight md:flex-none md:text-left md:text-3xl"
          >
            {settings.siteName ?? 'DhakaLive'}
          </Link>

          <div className="md:flex-1" />

          <Link
            href={searchPath(locale)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:text-[var(--color-brand)]"
          >
            <span className="sr-only">{d('search')}</span>
            <SearchIcon size={20} />
          </Link>
        </div>
      </div>

      {/*
        The section band, and it sticks.
        A reader four screens into a story has no way back to the sections
        without scrolling to the top, which on a front page this dense is a long
        way. Only this band sticks — carrying the masthead down too would spend
        a fifth of a phone screen on it.
      */}
      <nav
        aria-label={d('mainNavigation')}
        className="sticky top-0 z-40 hidden border-b border-[var(--color-rule)] bg-[var(--color-surface)]/95 backdrop-blur md:block"
      >
        <ul className="mx-auto flex max-w-[78rem] items-center gap-6 px-4">
          {items.map((item, index) => {
            const subsections = subsectionsFor(item)
            const href = navHref(item, locale)
            const key = `${item.label ?? 'item'}-${index}`

            return subsections.length > 0 && href && item.label ? (
              <NavDropdown
                key={key}
                label={item.label}
                href={href}
                locale={locale}
                expandLabel={d('showSubsections')}
              >
                {subsections}
              </NavDropdown>
            ) : (
              <li key={key}>
                <NavLink
                  item={item}
                  locale={locale}
                  className="inline-flex min-h-11 items-center font-[family-name:var(--font-display)] text-[0.9375rem] font-semibold hover:text-[var(--color-brand)]"
                />
              </li>
            )
          })}
        </ul>
      </nav>

      {/*
        On a phone the sections scroll sideways rather than collapsing into the
        drawer alone. The drawer is still there and still complete; this is the
        two or three sections a reader actually moves between, reachable without
        opening anything.
      */}
      <nav
        aria-label={d('mainNavigation')}
        className="border-b border-[var(--color-rule)] md:hidden"
      >
        <ul className="flex gap-5 overflow-x-auto px-4 py-2">
          {items.map((item, index) => (
            <li key={`${item.label ?? 'item'}-strip-${index}`} className="shrink-0">
              <NavLink
                item={item}
                locale={locale}
                className="inline-flex min-h-9 items-center font-[family-name:var(--font-display)] text-sm font-semibold whitespace-nowrap hover:text-[var(--color-brand)]"
              />
            </li>
          ))}
        </ul>
      </nav>

      {showTicker ? (
        <div className="bg-[var(--color-breaking)] text-[var(--color-on-brand)]">
          <div className="mx-auto flex max-w-[78rem] items-center gap-3 overflow-hidden px-4 py-2">
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
