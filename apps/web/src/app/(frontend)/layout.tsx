import type { Metadata } from 'next'
import { Noto_Sans_Bengali, Noto_Serif_Bengali } from 'next/font/google'
import type React from 'react'

import { DEFAULT_LOCALE } from '@dhakalive/config'

import { Analytics } from '../../components/Analytics'

import './globals.css'

/**
 * The Bengali faces are loaded rather than merely named.
 *
 * The stack used to open with `Noto Sans Bengali` and stop there, which meant
 * the masthead rendered in whatever Bengali face the reader's device happened
 * to ship — Vrinda on Windows, a Noto build on Android, something else on a
 * cheap handset. Type that is chosen but not delivered is not a design.
 *
 * Sans for display and serif for body is the pairing this design is built on:
 * the headline needs the flat, even colour of a sans at large sizes, and long
 * Bengali copy is easier to hold at length in a serif.
 *
 * `display: 'swap'` because a news front page must be readable before the fonts
 * arrive; a headline that is invisible for 300ms is worse than one that reflows.
 */
const displayFont = Noto_Sans_Bengali({
  subsets: ['bengali', 'latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display-loaded',
  display: 'swap',
})

const bodyFont = Noto_Serif_Bengali({
  subsets: ['bengali', 'latin'],
  weight: ['400', '600'],
  variable: '--font-body-loaded',
  display: 'swap',
})

/**
 * Root layout for the public site.
 *
 * `lang` is set on the `[locale]` layout, not here — but `<html>` must carry a
 * value even for the redirect page, so the default locale stands in. The real
 * per-locale value is applied by the nested layout.
 */
export const metadata: Metadata = {
  title: {
    default: 'DhakaLive',
    template: '%s — DhakaLive',
  },
  description: 'News from Bangladesh in Bengali and English.',
}

export default function FrontendLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={DEFAULT_LOCALE} className={`${displayFont.variable} ${bodyFont.variable}`}>
      <body className="min-h-screen">
        {children}
        <Analytics />
      </body>
    </html>
  )
}
