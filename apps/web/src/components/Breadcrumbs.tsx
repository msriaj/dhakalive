import Link from 'next/link'

import type { Locale } from '@dhakalive/config'

import { dictionary } from '../lib/dictionary'
import { homePath } from '../lib/routes'

export interface Crumb {
  label: string
  href?: string
}

/**
 * Breadcrumb trail.
 *
 * The current page is a plain `<span>` with `aria-current="page"` rather than a
 * link to itself, and the separators are `aria-hidden` so they are not read out
 * between every item.
 */
export function Breadcrumbs({ crumbs, locale }: { crumbs: Crumb[]; locale: Locale }) {
  const d = dictionary(locale)
  const all: Crumb[] = [{ label: d('home'), href: homePath(locale) }, ...crumbs]

  return (
    <nav aria-label={d('breadcrumb')} className="text-sm text-[var(--color-ink-muted)]">
      <ol className="flex flex-wrap items-center gap-1">
        {all.map((crumb, index) => {
          const isLast = index === all.length - 1
          return (
            <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
              {index > 0 ? <span aria-hidden="true">/</span> : null}
              {crumb.href && !isLast ? (
                <Link href={crumb.href} className="hover:text-[var(--color-ink)]">
                  {crumb.label}
                </Link>
              ) : (
                <span aria-current={isLast ? 'page' : undefined}>{crumb.label}</span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
