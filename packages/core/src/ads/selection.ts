/**
 * Choosing which advertisement to show.
 *
 * Pure, and worth being pure: eligibility is a set of overlapping rules — a
 * schedule, a locale, a section, an active flag — and "the wrong ad appeared on
 * the wrong page" is a commercial problem, sometimes a contractual one. These
 * rules are asserted in tests rather than discovered in production.
 */

/** Where on the page an advertisement may appear. */
export const AD_PLACEMENTS = ['leaderboard', 'in-article', 'footer'] as const

export type AdPlacement = (typeof AD_PLACEMENTS)[number]

export function isAdPlacement(value: unknown): value is AdPlacement {
  return typeof value === 'string' && (AD_PLACEMENTS as readonly string[]).includes(value)
}

export interface AdCandidate {
  id: string | number
  placement: string
  isActive?: boolean | null
  startsAt?: string | null
  endsAt?: string | null
  /** Empty means every locale. */
  locales?: readonly string[] | null
  /** Empty means every section. */
  categoryIds?: readonly (string | number)[] | null
  /** Relative share of impressions. Non-positive values never appear. */
  weight?: number | null
}

export interface AdContext {
  placement: AdPlacement
  locale: string
  /** The section being viewed, when there is one. */
  categoryId?: string | number | null
  /** Evaluation time, injected so scheduling is testable. */
  now: number
}

function withinSchedule(candidate: AdCandidate, now: number): boolean {
  if (candidate.startsAt) {
    const start = Date.parse(candidate.startsAt)
    // An unparseable date is treated as "not yet running" rather than "always".
    // A campaign that fails to appear is noticed; one that never stops is not.
    if (Number.isNaN(start) || now < start) return false
  }

  if (candidate.endsAt) {
    const end = Date.parse(candidate.endsAt)
    if (Number.isNaN(end) || now >= end) return false
  }

  return true
}

/**
 * An empty targeting list means "no restriction", not "matches nothing".
 *
 * This is the direction that fails safe for a newsroom: an ad booked without
 * targeting runs everywhere, which is what an advertiser buying a run-of-site
 * placement expects. The opposite default would silently sell nothing.
 */
function matchesList<T>(
  list: readonly T[] | null | undefined,
  value: T | null | undefined,
): boolean {
  if (!list || list.length === 0) return true
  if (value === null || value === undefined) return false
  return list.some((entry) => String(entry) === String(value))
}

export function isAdEligible(candidate: AdCandidate, context: AdContext): boolean {
  if (candidate.isActive === false) return false
  if (candidate.placement !== context.placement) return false
  if (!withinSchedule(candidate, context.now)) return false
  if (!matchesList(candidate.locales, context.locale)) return false
  if (!matchesList(candidate.categoryIds, context.categoryId ?? null)) return false

  return (candidate.weight ?? 1) > 0
}

/**
 * Deterministic pseudo-random value from a seed.
 *
 * A hash rather than `Math.random()` so a given seed always produces the same
 * choice: pages are cached, and a selection that changed on every call would
 * differ between the render that populated the cache and any later assertion
 * about it. Rotation comes from varying the seed, not from randomness.
 */
function hashToUnitInterval(seed: string): number {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  // `>>> 0` makes it unsigned before scaling into [0, 1).
  return (hash >>> 0) / 4294967296
}

/**
 * Picks one advertisement, weighted.
 *
 * Weight is a share of impressions: an ad with weight 3 appears three times as
 * often as one with weight 1, given enough seeds. The seed is supplied by the
 * caller — see the note in the component about what rotation means on a cached
 * page.
 *
 * Returns null when nothing is eligible, which is the common case for a
 * publication that has not sold that slot.
 */
export function selectAd<T extends AdCandidate>(
  candidates: readonly T[],
  context: AdContext,
  seed: string,
): T | null {
  const eligible = candidates.filter((candidate) => isAdEligible(candidate, context))
  if (eligible.length === 0) return null

  const total = eligible.reduce((sum, candidate) => sum + (candidate.weight ?? 1), 0)
  let target = hashToUnitInterval(seed) * total

  for (const candidate of eligible) {
    target -= candidate.weight ?? 1
    if (target < 0) return candidate
  }

  // Floating-point drift can leave the target fractionally above zero after the
  // final subtraction; the last eligible candidate is the correct answer.
  return eligible[eligible.length - 1] ?? null
}
