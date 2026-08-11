import Link from 'next/link'

import { DEFAULT_LOCALE } from '@dhakalive/config'

import { dictionary } from '../../../lib/dictionary'
import { homePath } from '../../../lib/routes'

/**
 * 404 within a locale.
 *
 * A `not-found` boundary cannot read route params, so it renders in the default
 * locale. Getting the locale right here would mean turning every 404 into a
 * dynamic render, which is a poor trade for an error page.
 */
export default function NotFound() {
  const locale = DEFAULT_LOCALE
  const d = dictionary(locale)

  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <p className="text-6xl font-bold text-[var(--color-brand)]">404</p>
      <h1 className="mt-4 text-2xl font-bold">{d('notFoundTitle')}</h1>
      <p className="mt-3 text-[var(--color-ink-muted)]">{d('notFoundBody')}</p>
      <Link
        href={homePath(locale)}
        className="mt-8 inline-flex min-h-11 items-center rounded-md bg-[var(--color-brand)] px-5 font-medium text-[var(--color-on-brand)]"
      >
        {d('backToHome')}
      </Link>
    </div>
  )
}
