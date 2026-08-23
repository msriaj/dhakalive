import { describe, expect, it } from 'vitest'

import { MIN_INDEXABLE_TAG_ARTICLES, isIndexableTag } from './thin-content'

/**
 * The threshold is one number used in two places — the sitemap and the tag
 * page's robots meta — and the whole point is that they agree. These assertions
 * pin the boundary so a change to one cannot quietly diverge from the other.
 */
describe('isIndexableTag', () => {
  it('excludes a tag with no articles', () => {
    expect(isIndexableTag(0)).toBe(false)
  })

  /** The overwhelmingly common case: 977 tags, most carrying exactly one story. */
  it('excludes a single-article tag', () => {
    expect(isIndexableTag(1)).toBe(false)
  })

  it('excludes just below the threshold', () => {
    expect(isIndexableTag(MIN_INDEXABLE_TAG_ARTICLES - 1)).toBe(false)
  })

  it('includes exactly at the threshold', () => {
    expect(isIndexableTag(MIN_INDEXABLE_TAG_ARTICLES)).toBe(true)
  })

  it('includes a well-covered topic', () => {
    expect(isIndexableTag(50)).toBe(true)
  })

  /**
   * A negative count means a bug upstream, not an indexable tag. Guarding it
   * here keeps a bad count from turning into an indexed thin page.
   */
  it('treats a nonsensical count as not indexable', () => {
    expect(isIndexableTag(-1)).toBe(false)
  })
})
