import { notFound } from 'next/navigation'
import type React from 'react'

import { isLocale } from '@dhakalive/config'

import { AdSlot } from '../../../components/AdSlot'
import { SiteFooter } from '../../../components/SiteFooter'
import { SiteHeader } from '../../../components/SiteHeader'
import { dictionary } from '../../../lib/dictionary'

/**
 * Locale shell: header, main landmark, footer.
 *
 * `lang` cannot be set on `<html>` from a nested layout, so it is applied to the
 * wrapper element instead. That still gives screen readers and hyphenation the
 * correct language for everything inside, which is the accessibility
 * requirement; the root `<html lang>` carries the default.
 */
/**
 * Deliberately no `generateStaticParams`.
 *
 * Exporting the locale list here would make Next prerender `/bn` and `/en` at
 * build time, which means the *image build* needs a reachable database. An
 * artifact that only builds when infrastructure is up cannot be rebuilt in a
 * clean CI runner or during an incident, and it bakes environment coupling into
 * something that should be environment-independent.
 *
 * Without it these routes render on first request and are then stored in the
 * full route cache under their `revalidate` window — the same caching, filled
 * lazily instead of at build. Unknown locales still 404 via the check below.
 */

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale: raw } = await params
  if (!isLocale(raw)) notFound()

  const locale = raw
  const d = dictionary(locale)

  return (
    <div lang={locale} dir="ltr">
      {/* First focusable element on the page, visible only when focused. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-[var(--color-surface)] focus:px-4 focus:py-2 focus:shadow-lg"
      >
        {d('skipToContent')}
      </a>

      <SiteHeader locale={locale} />

      {/* tabIndex -1 makes the skip link's target focusable. */}
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-8">
        {/*
          Above the content rather than above the header: a leaderboard between
          the masthead and the navigation pushes the navigation below the fold
          on a phone, which is where most of this site's readers are.
        */}
        <AdSlot placement="leaderboard" locale={locale} className="mb-8" />

        {children}

        <AdSlot placement="footer" locale={locale} className="mt-12" />
      </main>

      <SiteFooter locale={locale} />
    </div>
  )
}
