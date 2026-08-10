import 'server-only'

import type { Locale } from '@dhakalive/config'
import type { AdPlacement } from '@dhakalive/core'

import type { Advertisement } from '../../payload-types'
import { getPayloadClient } from './client'

/**
 * Bookings for one slot.
 *
 * The database narrows on the two things it can index cheaply — placement and
 * the active flag — and the remaining rules (schedule, locale, section,
 * weight) are applied in `selectAd`. Expressing a date window and two
 * optional-list memberships as a Payload `Where` is possible and unreadable,
 * and those rules are the part worth having unit tests for.
 *
 * The candidate set for a slot is small by construction: a newsroom sells a
 * handful of placements at a time, not thousands.
 */
const MAX_CANDIDATES = 50

export interface AdvertisementCandidates {
  docs: Advertisement[]
  /**
   * Evaluation time, read here rather than in the component.
   *
   * A React component must be pure, and `Date.now()` inside one is neither pure
   * nor lint-clean. Scheduling genuinely needs the clock, so it is read in this
   * plain async function and passed down as data.
   */
  now: number
}

export async function getAdvertisements(
  placement: AdPlacement,
  locale: Locale,
): Promise<AdvertisementCandidates> {
  const payload = await getPayloadClient()
  const now = Date.now()

  const result = await payload.find({
    collection: 'advertisements',
    locale,
    // depth 1 resolves the creative and the targeted categories, which is
    // everything the renderer and the selection rules need.
    depth: 1,
    limit: MAX_CANDIDATES,
    overrideAccess: false,
    where: {
      and: [{ placement: { equals: placement } }, { isActive: { not_equals: false } }],
    },
  })

  return { docs: result.docs, now }
}
