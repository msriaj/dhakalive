import { describe, expect, it } from 'vitest'

import { startsNavigation } from './link-intent'

const HERE = 'https://dhakalive.com/bangladesh/some-story?page=2'

function intent(overrides: Partial<Parameters<typeof startsNavigation>[0]> = {}) {
  return startsNavigation({ href: 'https://dhakalive.com/khela', currentUrl: HERE, ...overrides })
}

describe('clicks that start a navigation', () => {
  it('follows a same-origin link to another page', () => {
    expect(intent()).toBe(true)
  })

  /** Pagination keeps the path and moves the query; it is still a navigation. */
  it('follows a query-only change', () => {
    expect(intent({ href: 'https://dhakalive.com/bangladesh/some-story?page=3' })).toBe(true)
  })

  /**
   * The component hands over the DOM's already-resolved `href`, so this is
   * belt-and-braces — but the resolution is what makes an origin comparison
   * meaningful at all, and it should stay pinned.
   */
  it('resolves a relative href against the current URL', () => {
    expect(intent({ href: '/tag/dhaka' })).toBe(true)
    expect(intent({ href: '../khela' })).toBe(true)
  })

  it('accepts an explicit _self target', () => {
    expect(intent({ target: '_self' })).toBe(true)
  })
})

describe('clicks that do not', () => {
  /**
   * The expensive false positive: nothing re-renders, so nothing would ever
   * clear the overlay and the reader would sit under it until the timeout.
   */
  it('ignores a link to the current URL', () => {
    expect(intent({ href: HERE })).toBe(false)
  })

  it('ignores an in-page hash on the current URL', () => {
    expect(intent({ href: `${HERE}#comments` })).toBe(false)
  })

  /** The browser shows its own progress, and we would not be here to clean up. */
  it('ignores another origin', () => {
    expect(intent({ href: 'https://example.com/story' })).toBe(false)
  })

  it('ignores mailto and tel', () => {
    expect(intent({ href: 'mailto:desk@dhakalive.com' })).toBe(false)
    expect(intent({ href: 'tel:+8801000000000' })).toBe(false)
  })

  it('ignores a javascript: href', () => {
    expect(intent({ href: 'javascript:void(0)' })).toBe(false)
  })

  it('ignores a new-tab target', () => {
    expect(intent({ target: '_blank' })).toBe(false)
  })

  it('ignores a download', () => {
    expect(intent({ download: true })).toBe(false)
  })

  /** Middle click and right click open elsewhere or open a menu. */
  it('ignores non-primary buttons', () => {
    expect(intent({ button: 1 })).toBe(false)
    expect(intent({ button: 2 })).toBe(false)
  })

  /** Cmd/Ctrl-click opens a tab; this page stays exactly where it is. */
  it('ignores modifier clicks', () => {
    expect(intent({ modifierKey: true })).toBe(false)
  })

  it('ignores a click something else already handled', () => {
    expect(intent({ defaultPrevented: true })).toBe(false)
  })

  it('ignores an anchor with no href', () => {
    expect(intent({ href: null })).toBe(false)
  })

  /**
   * Nothing here may throw: this runs inside a document-wide click handler, and
   * an exception would take the click with it.
   */
  it('ignores an unusable current URL rather than throwing', () => {
    expect(() => intent({ currentUrl: 'not-a-url' })).not.toThrow()
    expect(intent({ currentUrl: 'not-a-url' })).toBe(false)
  })

  /**
   * A scheme the URL parser does not recognise is treated as a relative path,
   * which lands on this origin and counts as a navigation. Documented because
   * it looks like a hole and is not one — the component passes the DOM's
   * resolved href, which is always a real absolute URL.
   */
  it('treats an unrecognised scheme as a same-origin path', () => {
    expect(intent({ href: 'ht!tp://[[[' })).toBe(true)
  })
})
