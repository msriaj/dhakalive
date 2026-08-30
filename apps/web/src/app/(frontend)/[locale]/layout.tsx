import { notFound } from 'next/navigation'
import React, { Suspense } from 'react'

import { isPublicLocale } from '@dhakalive/config'

import { AdSlot } from '../../../components/AdSlot'
import { NavigationProgress } from '../../../components/NavigationProgress'
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
 * Declared, and deliberately empty.
 *
 * The function has to exist. Next lists a dynamic route in its prerender
 * manifest only if the route declares its params, and a route absent from the
 * manifest is served dynamically — no cache entry is ever written, and the
 * `revalidate` exports on the pages below have nothing to act on. This app
 * declared it nowhere, and production ran that way: every page, every request,
 * a full render against the database.
 *
 * The list is empty because returning the locales would prerender them, and
 * *rendering* the front page reads from Postgres even though *enumerating* the
 * locales does not. That is the failure the original comment here warned about
 * and it is a real one: an image that only builds while the database is up
 * cannot be rebuilt in a clean CI runner or during an incident.
 *
 * Empty gets both. Nothing is built ahead of time, and with `dynamicParams`
 * left at its default every locale is rendered on first request and then held
 * in the route cache for its `revalidate` window. Unknown locales still 404 via
 * the check below.
 */
export function generateStaticParams(): { locale: string }[] {
  return []
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
      {/*
        Suspense because the indicator reads `useSearchParams`, and without a
        boundary that opts every route beneath this layout out of static
        rendering. The fallback is nothing: until the first click there is
        nothing to show.
      */}
      <Suspense fallback={null}>
        <NavigationProgress label={d('loadingPage')} />
      </Suspense>

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
