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

export async function SiteFooter({ locale }: { locale: Locale }) {
  const d = dictionary(locale)
  const [footer, settings] = await Promise.all([getFooter(locale), getSiteSettings(locale)])

  const columns = footer.columns ?? []
  const social = settings.social ?? []
  const year = new Date().getFullYear()

  return (
    <footer className="mt-16 border-t border-[var(--color-rule)] bg-[var(--color-surface-sunken)]">
      <div className="mx-auto max-w-6xl px-4 py-10">
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

        {social.length > 0 ? (
          <ul className="mt-8 flex flex-wrap gap-4">
            {social.map((entry, index) => (
              <li key={`${entry.platform}-${index}`}>
                <a
                  href={entry.url}
                  rel="noopener noreferrer"
                  target="_blank"
                  className="text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                >
                  {SOCIAL_LABELS[entry.platform] ?? entry.platform}
                </a>
              </li>
            ))}
          </ul>
        ) : null}

        <p className="mt-8 border-t border-[var(--color-rule)] pt-6 text-sm text-[var(--color-ink-muted)]">
          © {year} {footer.copyright ?? settings.siteName ?? 'DhakaLive'}
        </p>
      </div>
    </footer>
  )
}
