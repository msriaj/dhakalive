import { describe, expect, it } from 'vitest'

import { formatRelativeTime } from './format'

/**
 * The relative timestamp is the one formatter with real branching, and the one
 * whose output a reader checks against their own sense of time. Every case
 * passes an explicit `now`, so these assertions cannot start failing on their
 * own the way a test anchored to the wall clock would.
 */
const NOW = new Date('2026-08-11T12:00:00.000Z')

function ago(seconds: number): string {
  return new Date(NOW.getTime() - seconds * 1000).toISOString()
}

describe('formatRelativeTime', () => {
  it('counts in the largest unit the elapsed time fills', () => {
    // 90 minutes is an hour ago, not ninety minutes ago.
    expect(formatRelativeTime(ago(90 * 60), 'en', NOW)).toBe('2 hours ago')
    expect(formatRelativeTime(ago(50 * 60), 'en', NOW)).toBe('50 minutes ago')
    expect(formatRelativeTime(ago(30), 'en', NOW)).toBe('30 seconds ago')
    expect(formatRelativeTime(ago(26 * 3600), 'en', NOW)).toBe('yesterday')
  })

  it('uses Bengali digits and wording for the Bengali locale', () => {
    const result = formatRelativeTime(ago(50 * 60), 'bn', NOW)

    // Asserting on the digits rather than the exact phrasing: the wording comes
    // from ICU and may be revised, but Bengali numerals are the requirement.
    expect(result).toMatch(/[০-৯]/)
    expect(result).not.toMatch(/[0-9]/)
  })

  /**
   * Past the cutoff a count-up stops helping — "৯ দিন আগে" is harder to place
   * than the date — so the format changes rather than growing without limit.
   */
  it('falls back to an absolute date beyond the cutoff', () => {
    const old = formatRelativeTime(ago(9 * 86_400), 'en', NOW)

    expect(old).not.toMatch(/ago/)
    expect(old).toContain('2026')
  })

  it('returns an empty string for missing or unparseable input', () => {
    expect(formatRelativeTime(null, 'bn', NOW)).toBe('')
    expect(formatRelativeTime(undefined, 'bn', NOW)).toBe('')
    expect(formatRelativeTime('not a date', 'bn', NOW)).toBe('')
  })
})
