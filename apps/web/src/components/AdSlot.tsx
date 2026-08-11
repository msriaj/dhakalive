import { selectAd, type AdPlacement } from '@dhakalive/core'
import type { Locale } from '@dhakalive/config'

import { dictionary } from '../lib/dictionary'
import { getAdvertisements } from '../lib/queries/advertisements'
import { MediaImage } from './MediaImage'

/**
 * Renders one advertisement slot, or nothing.
 *
 * ## What "rotation" means here
 *
 * Pages are statically generated, so whichever ad is chosen during a render is
 * served to every reader until that page is regenerated. Rotation is therefore
 * across *pages*, not across impressions: the seed is the slot plus the page, so
 * two stories in the same section show different creatives and weighting works
 * out across the site, while a given page is stable.
 *
 * Deliberately not seeded on the clock. That would make the component impure —
 * two renders of the same page disagreeing — and it would still not produce
 * per-impression rotation, only rotation per regeneration. Real per-impression
 * serving belongs in the browser or at the edge, and is not something to fake
 * here.
 *
 * ## Disclosure
 *
 * The label is rendered by this component rather than being an editor-supplied
 * field, so a paid placement cannot go out unmarked because somebody left a box
 * empty.
 */
export async function AdSlot({
  placement,
  locale,
  categoryId,
  pageKey,
  className,
}: {
  placement: AdPlacement
  locale: Locale
  /** The section being viewed, for section-targeted bookings. */
  categoryId?: string | number | null
  /** Distinguishes slots across pages so two pages do not draw identically. */
  pageKey?: string
  className?: string
}) {
  const { docs, now } = await getAdvertisements(placement, locale)
  if (docs.length === 0) return null

  const advertisement = selectAd(
    docs.map((candidate) => ({
      ...candidate,
      categoryIds: Array.isArray(candidate.categories)
        ? candidate.categories.map((entry) =>
            typeof entry === 'object' && entry !== null ? entry.id : entry,
          )
        : [],
      locales: candidate.languages ?? [],
    })),
    { placement, locale, categoryId: categoryId ?? null, now },
    `${placement}:${pageKey ?? 'site'}`,
  )

  if (!advertisement) return null

  const d = dictionary(locale)

  /**
   * A rail creative is 300px wide, not 970. Left on the leaderboard hint it
   * would be requested at three times the width it is painted at, on the one
   * page that already carries the most images.
   */
  const isRail = placement === 'sidebar'

  return (
    <aside
      // Labelled, so a screen reader user knows this is not editorial content
      // before they reach the image.
      aria-label={d('advertisement')}
      className={className ?? 'my-8'}
    >
      <p className="mb-1 text-center text-[11px] tracking-wide text-[var(--color-ink-muted)] uppercase">
        {d('advertisement')}
        {advertisement.advertiser ? ` · ${advertisement.advertiser}` : ''}
      </p>

      <a
        href={advertisement.destinationUrl}
        /**
         * `sponsored` is what search engines require on a paid link, and
         * omitting it puts the site's own rankings at risk. `noopener` stops
         * the destination reaching back through `window.opener`; `nofollow`
         * is redundant beside `sponsored` but is still what several older
         * crawlers actually read.
         */
        rel="sponsored nofollow noopener"
        target="_blank"
        className="block"
      >
        <MediaImage
          media={advertisement.image}
          sizes={isRail ? '(min-width: 1024px) 300px, 100vw' : '(min-width: 1024px) 970px, 100vw'}
          className={
            isRail
              ? 'mx-auto h-auto w-full max-w-[300px] rounded-md'
              : 'mx-auto h-auto w-full max-w-[970px] rounded-md'
          }
        />
      </a>
    </aside>
  )
}
