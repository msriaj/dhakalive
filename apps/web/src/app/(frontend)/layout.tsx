import type { Metadata } from 'next'
import type React from 'react'

import { DEFAULT_LOCALE } from '@dhakalive/config'

import './globals.css'

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
    <html lang={DEFAULT_LOCALE}>
      <body className="min-h-screen">{children}</body>
    </html>
  )
}
