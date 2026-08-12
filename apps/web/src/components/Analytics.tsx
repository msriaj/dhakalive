import Script from 'next/script'

import { DEFAULT_GA_MEASUREMENT_ID } from '@dhakalive/config'

/**
 * Google Analytics 4.
 *
 * The property id defaults to the site's own, so a plain build is measured
 * without anyone having to remember a variable. `NEXT_PUBLIC_GA_ID` overrides
 * it — for a staging property, or a fork that should not report here.
 *
 * Read as a literal `process.env` member rather than through the validated env
 * helper, because that is the only form Next inlines into a build. The cost is
 * that the id is baked into the image: changing it needs another build, not a
 * restart — the same trade `NEXT_PUBLIC_SITE_URL` already makes, and the deploy
 * workflow says so where it checks its build variables.
 *
 * Tested for emptiness rather than for null, because an unset Docker build
 * argument arrives as an empty string rather than as undefined, and an empty
 * id would tag the page with nothing at all.
 */
function resolveMeasurementId(): string {
  const override = process.env.NEXT_PUBLIC_GA_ID?.trim()
  if (override) return override
  return DEFAULT_GA_MEASUREMENT_ID
}

const GA_ID = resolveMeasurementId()

/**
 * Production builds only.
 *
 * With the id defaulted rather than configured, every `pnpm dev` session and
 * every CI run would otherwise post page views to the live property, and the
 * numbers a newsroom reads would include the people building the site.
 */
const ENABLED = process.env.NODE_ENV === 'production'

/**
 * Mounted in the (frontend) layout only. The Payload admin is a separate route
 * group and has no business reporting editors' clicks to Google.
 */
export function Analytics() {
  if (!ENABLED) return null

  return (
    <>
      {/*
       * `afterInteractive` — the tag loads once the page is usable, not before.
       * A news front page on a Bangladeshi phone connection cannot afford to
       * spend its first round trips on measurement; the reader's first
       * paragraph outranks the pageview, and the pageview still arrives.
       */}
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      {/*
       * No manual pageview on route change. GA4's enhanced measurement listens
       * for History API navigations, which is what the App Router performs, so
       * hand-firing one here would double-count every click-through.
       */}
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');`}
      </Script>
    </>
  )
}
