import type { Metadata } from 'next'
import type React from 'react'

import { DEFAULT_LOCALE } from '@dhakalive/config'

import './globals.css'

/**
 * Root layout for the public site. Phase 4 replaces this with the real shell
 * (header, navigation, footer, breaking-news ticker) and moves `lang` onto the
 * `[locale]` segment. Until then it hard-codes the default locale rather than
 * emitting a wrong or missing `lang`, which is an accessibility failure.
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
    <html lang={DEFAULT_LOCALE}>
      <body>{children}</body>
    </html>
  )
}
