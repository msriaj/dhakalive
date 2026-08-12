import { notFound } from 'next/navigation'
import type React from 'react'

import { PUBLIC_LOCALES, isPublicLocale } from '@dhakalive/config'

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
 * The published locales, and nothing else.
 *
 * This used to be omitted on the reasoning that a route without
 * `generateStaticParams` still fills the full route cache on first request.
 * It does not. Next lists a dynamic route in its prerender manifest only if the
 * route declares its params, and a route that is not in the manifest is served
 * dynamically — no cache entry is ever written, and the `revalidate` exports on
 * the pages below have nothing to act on. Production ran that way: every page,
 * every request, a full render against the database.
 *
 * The concern behind the omission was real, and is kept. Prerendering must not
 * require a reachable database, or the image only builds while infrastructure
 * is up. It does not require one here: this list is a constant, and every
 * dynamic segment underneath returns `[]` — build nothing, cache everything on
 * first request. Unknown locales still 404 via the check below.
 */
export function generateStaticParams(): { locale: string }[] {
  return PUBLIC_LOCALES.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale: raw } = await params
  // `isPublicLocale`, not `isLocale`: English is authored but unpublished, so
  // `/en/…` must 404 rather than render — the redirect sends readers to the
  // Bengali equivalent, and this is what stops anything slipping past it.
  if (!isPublicLocale(raw)) notFound()

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
      <main id="main" tabIndex={-1} className="mx-auto max-w-[78rem] px-4 py-8">
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
