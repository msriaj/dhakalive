import { describe, expect, it } from 'vitest'

import {
  isAdEligible,
  isAdPlacement,
  selectAd,
  type AdCandidate,
  type AdContext,
} from './selection.js'

const NOW = Date.parse('2026-08-10T12:00:00.000Z')

const context: AdContext = { placement: 'leaderboard', locale: 'bn', now: NOW }

const ad = (overrides: Partial<AdCandidate> = {}): AdCandidate => ({
  id: 1,
  placement: 'leaderboard',
  isActive: true,
  weight: 1,
  ...overrides,
})

describe('isAdEligible', () => {
  it('accepts an active, unscheduled, untargeted ad in the right slot', () => {
    expect(isAdEligible(ad(), context)).toBe(true)
  })

  it('rejects an inactive ad', () => {
    expect(isAdEligible(ad({ isActive: false }), context)).toBe(false)
  })

  it('rejects an ad for a different placement', () => {
    expect(isAdEligible(ad({ placement: 'footer' }), context)).toBe(false)
  })

  it('rejects an ad with no weight, so a paused campaign can be zeroed out', () => {
    expect(isAdEligible(ad({ weight: 0 }), context)).toBe(false)
    expect(isAdEligible(ad({ weight: -1 }), context)).toBe(false)
  })

  describe('scheduling', () => {
    it('rejects an ad that has not started', () => {
      expect(isAdEligible(ad({ startsAt: '2026-08-11T00:00:00.000Z' }), context)).toBe(false)
    })

    it('accepts an ad already running', () => {
      expect(isAdEligible(ad({ startsAt: '2026-08-01T00:00:00.000Z' }), context)).toBe(true)
    })

    it('rejects an ad whose flight has ended', () => {
      expect(isAdEligible(ad({ endsAt: '2026-08-09T00:00:00.000Z' }), context)).toBe(false)
    })

    it('treats the end as exclusive', () => {
      expect(isAdEligible(ad({ endsAt: '2026-08-10T12:00:00.000Z' }), context)).toBe(false)
      expect(isAdEligible(ad({ endsAt: '2026-08-10T12:00:00.001Z' }), context)).toBe(true)
    })

    /**
     * An ad that fails to appear gets reported; one that never stops does not,
     * and may be a billing dispute. So a malformed date fails closed.
     */
    it('treats an unparseable date as not running', () => {
      expect(isAdEligible(ad({ startsAt: 'soon' }), context)).toBe(false)
      expect(isAdEligible(ad({ endsAt: 'never' }), context)).toBe(false)
    })
  })

  describe('targeting', () => {
    it('treats an empty list as no restriction, which is run-of-site', () => {
      expect(isAdEligible(ad({ locales: [], categoryIds: [] }), context)).toBe(true)
      expect(isAdEligible(ad({ locales: null, categoryIds: null }), context)).toBe(true)
    })

    it('matches a targeted locale', () => {
      expect(isAdEligible(ad({ locales: ['bn'] }), context)).toBe(true)
      expect(isAdEligible(ad({ locales: ['en'] }), context)).toBe(false)
      expect(isAdEligible(ad({ locales: ['en', 'bn'] }), context)).toBe(true)
    })

    it('matches a targeted section', () => {
      const inSection = { ...context, categoryId: 4 }
      expect(isAdEligible(ad({ categoryIds: [4] }), inSection)).toBe(true)
      expect(isAdEligible(ad({ categoryIds: [9] }), inSection)).toBe(false)
    })

    it('compares ids across the string and number boundary', () => {
      expect(isAdEligible(ad({ categoryIds: ['4'] }), { ...context, categoryId: 4 })).toBe(true)
    })

    /** A section-targeted ad has no business on a page with no section. */
    it('rejects a section-targeted ad where there is no section', () => {
      expect(isAdEligible(ad({ categoryIds: [4] }), context)).toBe(false)
    })
  })
})

describe('selectAd', () => {
  it('returns null when nothing is eligible', () => {
    expect(selectAd([], context, 'seed')).toBeNull()
    expect(selectAd([ad({ isActive: false })], context, 'seed')).toBeNull()
  })

  it('returns the only eligible candidate', () => {
    const only = ad({ id: 7 })
    expect(selectAd([only, ad({ id: 8, placement: 'footer' })], context, 'seed')?.id).toBe(7)
  })

  /** Cached pages must not change their mind between renders of the same seed. */
  it('is deterministic for a given seed', () => {
    const candidates = [ad({ id: 1 }), ad({ id: 2 }), ad({ id: 3 })]
    const first = selectAd(candidates, context, 'article-42')
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(selectAd(candidates, context, 'article-42')?.id).toBe(first?.id)
    }
  })

  it('varies with the seed', () => {
    const candidates = [ad({ id: 1 }), ad({ id: 2 }), ad({ id: 3 })]
    const seen = new Set<unknown>()
    for (let index = 0; index < 50; index += 1) {
      seen.add(selectAd(candidates, context, `seed-${index}`)?.id)
    }
    expect(seen.size).toBeGreaterThan(1)
  })

  it('respects weight as a share of impressions', () => {
    const candidates = [ad({ id: 'heavy', weight: 9 }), ad({ id: 'light', weight: 1 })]

    let heavy = 0
    const runs = 2000
    for (let index = 0; index < runs; index += 1) {
      if (selectAd(candidates, context, `seed-${index}`)?.id === 'heavy') heavy += 1
    }

    // Nine to one, with room for the hash not being a perfect uniform source.
    expect(heavy / runs).toBeGreaterThan(0.82)
    expect(heavy / runs).toBeLessThan(0.97)
  })

  it('never returns an ineligible candidate', () => {
    const candidates = [
      ad({ id: 'wrong-slot', placement: 'footer' }),
      ad({ id: 'expired', endsAt: '2026-01-01T00:00:00.000Z' }),
      ad({ id: 'good' }),
    ]

    for (let index = 0; index < 30; index += 1) {
      expect(selectAd(candidates, context, `seed-${index}`)?.id).toBe('good')
    }
  })
})

describe('isAdPlacement', () => {
  it('accepts the defined placements and nothing else', () => {
    expect(isAdPlacement('leaderboard')).toBe(true)
    expect(isAdPlacement('in-article')).toBe(true)
    expect(isAdPlacement('footer')).toBe(true)
    expect(isAdPlacement('popup')).toBe(false)
    expect(isAdPlacement(null)).toBe(false)
  })
})
