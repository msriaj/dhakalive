import type React from 'react'

import type { Locale } from '@dhakalive/config'

import { dictionary } from '../lib/dictionary'
import { getFooter, getSiteSettings } from '../lib/queries/globals'
import { NavLink, type NavItem } from './NavLink'

const SOCIAL_LABELS: Record<string, string> = {
  facebook: 'Facebook',
  x: 'X',
  youtube: 'YouTube',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  whatsapp: 'WhatsApp',
}

/**
 * Brand marks, drawn rather than named.
 *
 * A row of six words — "Facebook X YouTube LinkedIn…" — is read as a list of
 * links; a row of marks is read as "follow us", which is what the band is for.
 * The name stays in the markup as the accessible name, so nothing is lost to a
 * screen reader or to a reader whose images fail.
 */
const SOCIAL_MARKS: Record<string, React.ReactNode> = {
  facebook: <path d="M14 9h3V6h-3c-2.2 0-4 1.8-4 4v2H8v3h2v7h3v-7h3l1-3h-4v-2c0-.6.4-1 1-1z" />,
  x: (
    <path d="M17.5 3h3l-6.6 7.5L21.8 21h-6l-4.3-5.7L6.4 21H3.3l7-8L2.5 3h6.2l3.9 5.2zm-1.1 16h1.7L7.7 4.7H5.9z" />
  ),
  youtube: (
    <path d="M22 8.2a3 3 0 0 0-2.1-2.1C18 5.6 12 5.6 12 5.6s-6 0-7.9.5A3 3 0 0 0 2 8.2 31 31 0 0 0 1.5 12 31 31 0 0 0 2 15.8a3 3 0 0 0 2.1 2.1c1.9.5 7.9.5 7.9.5s6 0 7.9-.5a3 3 0 0 0 2.1-2.1c.3-1.3.5-2.5.5-3.8s-.2-2.5-.5-3.8zM10 15V9l5.2 3z" />
  ),
  instagram: (
    <path d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.3 2.2.4.6.2 1 .5 1.4.9s.7.8.9 1.4c.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c0 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4s-.8.7-1.4.9c-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2 0-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9s-.7-.8-.9-1.4c-.2-.4-.4-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c0-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4s.8-.7 1.4-.9c.4-.2 1-.4 2.2-.4C8.4 2.2 8.8 2.2 12 2.2zm0 3.2A6.6 6.6 0 1 0 18.6 12 6.6 6.6 0 0 0 12 5.4zm0 10.9A4.3 4.3 0 1 1 16.3 12 4.3 4.3 0 0 1 12 16.3zm6.9-11.1a1.5 1.5 0 1 1-1.6-1.6 1.5 1.5 0 0 1 1.6 1.6z" />
  ),
  linkedin: (
    <path d="M6.9 21H3.6V9.3h3.3zM5.2 7.9a1.9 1.9 0 1 1 1.9-1.9 1.9 1.9 0 0 1-1.9 1.9zM21 21h-3.3v-5.7c0-1.4 0-3.1-1.9-3.1s-2.2 1.5-2.2 3v5.8H10.3V9.3h3.1v1.6h.1a3.5 3.5 0 0 1 3.1-1.7c3.3 0 3.9 2.2 3.9 5z" />
  ),
  whatsapp: (
    <path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm5.8 14.2c-.2.7-1.4 1.3-2 1.4s-1.2.2-3.4-.7a12 12 0 0 1-5-4.4c-.4-.6-1-1.6-1-3a3.3 3.3 0 0 1 1-2.4.9.9 0 0 1 .7-.3h.5c.2 0 .4 0 .6.5l.9 2c.1.2.1.3 0 .5l-.4.5-.3.3c-.1.2-.2.3 0 .6a9 9 0 0 0 1.6 2 8 8 0 0 0 2.3 1.4c.3.2.5.1.6 0l1-1.1c.2-.2.3-.2.6-.1l2 1c.3.1.4.2.5.3a2 2 0 0 1-.2 1.1z" />
  ),
}

function SocialLink({ platform, url }: { platform: string; url: string }) {
  const label = SOCIAL_LABELS[platform] ?? platform
  const mark = SOCIAL_MARKS[platform]

  return (
    <a
      href={url}
      rel="noopener noreferrer"
      target="_blank"
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[var(--color-rule)] text-[var(--color-ink-muted)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]"
    >
      {mark ? (
        <>
          <span className="sr-only">{label}</span>
          <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            {mark}
          </svg>
        </>
      ) : (
        <span className="px-3 text-sm">{label}</span>
      )}
    </a>
  )
}

/**
 * Site footer.
 *
 * Four bands, in the order a Bengali daily prints them: the group's other
 * titles, the section columns, a follow-and-download band, and then the
 * statutory row — policy links, copyright and the imprint naming the editor and
 * publisher. The order is not arbitrary; the last band is the one a reader goes
 * looking for when they want to know who is responsible for what they just
 * read, and it belongs at the foot of the page rather than among the
 * navigation.
 */
export async function SiteFooter({ locale }: { locale: Locale }) {
  const d = dictionary(locale)
  const [footer, settings] = await Promise.all([getFooter(locale), getSiteSettings(locale)])

  const brandLinks = (footer.brandLinks ?? []) as NavItem[]
  const columns = footer.columns ?? []
  const bottomLinks = (footer.bottomLinks ?? []) as NavItem[]
  const social = settings.social ?? []
  const apps = footer.apps
  const hasApps = apps?.enabled !== false && Boolean(apps?.appStoreUrl ?? apps?.playStoreUrl)
  const year = new Date().getFullYear()

  return (
    <footer className="mt-16 border-t border-[var(--color-rule)] bg-[var(--color-surface-sunken)]">
      {brandLinks.length > 0 ? (
        <nav
          aria-label={d('otherPublications')}
          className="border-b border-[var(--color-rule)] bg-[var(--color-surface-raised)]"
        >
          <ul className="mx-auto flex max-w-[78rem] flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 py-3">
            {brandLinks.map((link, index) => (
              <li key={`${link.label ?? 'brand'}-${index}`}>
                <NavLink
                  item={link}
                  locale={locale}
                  className="font-[family-name:var(--font-display)] text-sm font-semibold hover:text-[var(--color-brand)]"
                />
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <div className="mx-auto max-w-[78rem] px-4 py-10">
        {columns.length > 0 ? (
          <nav aria-label={d('footerNavigation')}>
            <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
              {columns.map((column, columnIndex) => (
                <div key={`${column.heading ?? 'column'}-${columnIndex}`}>
                  <h2 className="mb-3 text-sm font-semibold tracking-wide uppercase">
                    {column.heading}
                  </h2>
                  <ul className="space-y-2">
                    {(column.links ?? []).map((link, linkIndex) => (
                      <li key={`${link.label ?? 'link'}-${linkIndex}`}>
                        <NavLink
                          item={link as NavItem}
                          locale={locale}
                          className="text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </nav>
        ) : null}

        {social.length > 0 || hasApps ? (
          <div
            className={`flex flex-col gap-6 border-[var(--color-rule)] sm:flex-row sm:items-start sm:justify-between ${
              columns.length > 0 ? 'mt-8 border-t pt-8' : ''
            }`}
          >
            {social.length > 0 ? (
              <div>
                <h2 className="mb-3 text-sm font-semibold tracking-wide uppercase">
                  {footer.followHeading ?? d('followUs')}
                </h2>
                <ul className="flex flex-wrap gap-2">
                  {social.map((entry, index) => (
                    <li key={`${entry.platform}-${index}`}>
                      <SocialLink platform={entry.platform} url={entry.url} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {hasApps ? (
              <div>
                <h2 className="mb-3 text-sm font-semibold tracking-wide uppercase">
                  {apps?.heading ?? d('downloadApps')}
                </h2>
                {/*
                  Text buttons rather than the official store badges: the badges
                  are trademarked artwork with their own placement rules, and a
                  self-drawn approximation of one is worse than a plain link.
                */}
                <ul className="flex flex-wrap gap-3">
                  {apps?.appStoreUrl ? (
                    <li>
                      <a
                        href={apps.appStoreUrl}
                        rel="noopener noreferrer"
                        target="_blank"
                        className="inline-flex min-h-11 items-center rounded-md border border-[var(--color-rule)] px-4 text-sm hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]"
                      >
                        App Store
                      </a>
                    </li>
                  ) : null}
                  {apps?.playStoreUrl ? (
                    <li>
                      <a
                        href={apps.playStoreUrl}
                        rel="noopener noreferrer"
                        target="_blank"
                        className="inline-flex min-h-11 items-center rounded-md border border-[var(--color-rule)] px-4 text-sm hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]"
                      >
                        Google Play
                      </a>
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-8 border-t border-[var(--color-rule)] pt-6">
          {bottomLinks.length > 0 ? (
            <nav aria-label={d('footerNavigation')}>
              <ul className="mb-4 flex flex-wrap gap-x-5 gap-y-2">
                {bottomLinks.map((link, index) => (
                  <li key={`${link.label ?? 'bottom'}-${index}`}>
                    <NavLink
                      item={link}
                      locale={locale}
                      className="text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                    />
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}

          <p className="text-sm text-[var(--color-ink-muted)]">
            © {year} {footer.copyright ?? settings.siteName ?? 'DhakaLive'}
          </p>

          {footer.imprint ? (
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{footer.imprint}</p>
          ) : null}
        </div>
      </div>
    </footer>
  )
}
