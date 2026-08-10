import { describe, expect, it } from 'vitest'
import { MAX_SLUG_LENGTH, isValidSlug, slugify, uniqueSlug } from './slugify.js'

describe('slugify', () => {
  it('lowercases and hyphenates English headlines', () => {
    expect(slugify('Dhaka Metro Rail Opens New Line')).toBe('dhaka-metro-rail-opens-new-line')
  })

  it('collapses punctuation and repeated separators', () => {
    expect(slugify('Budget 2026: what it means — for you!')).toBe(
      'budget-2026-what-it-means-for-you',
    )
  })

  it('strips leading and trailing separators', () => {
    expect(slugify('  ...Breaking...  ')).toBe('breaking')
  })

  it('preserves Bengali script rather than transliterating it', () => {
    expect(slugify('ঢাকা মেট্রো রেল')).toBe('ঢাকা-মেট্রো-রেল')
  })

  it('keeps Bengali digits', () => {
    expect(slugify('বাজেট ২০২৬')).toBe('বাজেট-২০২৬')
  })

  it('removes zero-width characters so look-alike slugs cannot collide', () => {
    const withZwnj = slugify('\u09AC\u09BE\u0982\u200C\u09B2\u09BE')
    const without = slugify('বাংলা')
    expect(withZwnj).toBe(without)
  })

  it('removes Latin diacritics', () => {
    expect(slugify('Café Résumé')).toBe('cafe-resume')
  })

  it('handles mixed Bengali and English', () => {
    expect(slugify('ঢাকা Metro 2026')).toBe('ঢাকা-metro-2026')
  })

  it('returns an empty string when nothing survives', () => {
    expect(slugify('!!! @#$ %^&')).toBe('')
  })

  it('truncates without leaving a trailing hyphen', () => {
    const long = `${'a'.repeat(MAX_SLUG_LENGTH - 1)} tail`
    const result = slugify(long)
    expect(result.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH)
    expect(result.endsWith('-')).toBe(false)
  })

  it('is idempotent', () => {
    const once = slugify('Dhaka — Metro: Line ৬ opens')
    expect(slugify(once)).toBe(once)
  })
})

describe('isValidSlug', () => {
  it.each([
    ['dhaka-metro-rail', true],
    ['ঢাকা-মেট্রো', true],
    ['Dhaka-Metro', false],
    ['dhaka--metro', false],
    ['-dhaka', false],
    ['dhaka ', false],
    ['', false],
  ])('%s -> %s', (value, expected) => {
    expect(isValidSlug(value)).toBe(expected)
  })
})

describe('uniqueSlug', () => {
  it('returns the base slug when it is free', () => {
    expect(uniqueSlug('Dhaka Metro', () => false)).toBe('dhaka-metro')
  })

  it('appends an incrementing suffix until one is free', () => {
    const taken = new Set(['dhaka-metro', 'dhaka-metro-2'])
    expect(uniqueSlug('Dhaka Metro', (candidate) => taken.has(candidate))).toBe('dhaka-metro-3')
  })

  it('keeps suffixed slugs within the length limit', () => {
    const taken = new Set([slugify('x'.repeat(MAX_SLUG_LENGTH))])
    const result = uniqueSlug('x'.repeat(MAX_SLUG_LENGTH), (candidate) => taken.has(candidate))
    expect(result.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH)
    expect(result.endsWith('-2')).toBe(true)
  })

  it('throws when the input cannot produce a slug', () => {
    expect(() => uniqueSlug('!!!', () => false)).toThrow(/Cannot derive a slug/)
  })

  it('throws rather than looping forever when every candidate is taken', () => {
    expect(() => uniqueSlug('news', () => true, 5)).toThrow(/Could not find a free slug/)
  })
})
