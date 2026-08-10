import { describe, expect, it } from 'vitest'

import {
  REDIRECT_STATUS,
  followRedirectChain,
  isRedirectPermanence,
  normaliseRedirectPath,
  parseRedirectTarget,
} from './path.js'

describe('normaliseRedirectPath', () => {
  it('accepts a plain path unchanged', () => {
    expect(normaliseRedirectPath('/bn/politics/a-story')).toBe('/bn/politics/a-story')
  })

  it('rejects anything that is not a site-relative path', () => {
    expect(normaliseRedirectPath('https://evil.example/x')).toBeNull()
    expect(normaliseRedirectPath('bn/politics')).toBeNull()
    expect(normaliseRedirectPath('')).toBeNull()
    expect(normaliseRedirectPath('   ')).toBeNull()
    expect(normaliseRedirectPath(null)).toBeNull()
    expect(normaliseRedirectPath(42)).toBeNull()
  })

  /** `//evil.example` looks like a path and is a protocol-relative URL. */
  it('rejects protocol-relative URLs', () => {
    expect(normaliseRedirectPath('//evil.example/x')).toBeNull()
  })

  it('decodes percent-encoding so a Bengali slug has one canonical form', () => {
    expect(normaliseRedirectPath('/bn/%E0%A6%AC%E0%A6%BE%E0%A6%9C%E0%A7%87%E0%A6%9F')).toBe(
      '/bn/বাজেট',
    )
    expect(normaliseRedirectPath('/bn/বাজেট')).toBe('/bn/বাজেট')
  })

  it('keeps a malformed escape sequence rather than throwing', () => {
    expect(normaliseRedirectPath('/bn/%E0%A6')).toBe('/bn/%E0%A6')
  })

  it('drops the query string and fragment', () => {
    expect(normaliseRedirectPath('/bn/a?utm_source=x')).toBe('/bn/a')
    expect(normaliseRedirectPath('/bn/a#section')).toBe('/bn/a')
    expect(normaliseRedirectPath('/bn/a?x=1#y')).toBe('/bn/a')
  })

  it('removes a trailing slash but keeps the root', () => {
    expect(normaliseRedirectPath('/bn/a/')).toBe('/bn/a')
    expect(normaliseRedirectPath('/')).toBe('/')
  })

  it('collapses repeated slashes, which routing treats as one', () => {
    expect(normaliseRedirectPath('/bn//politics///a')).toBe('/bn/politics/a')
  })

  it('preserves case, because slugs are case-sensitive here', () => {
    expect(normaliseRedirectPath('/bn/Politics')).toBe('/bn/Politics')
  })
})

describe('parseRedirectTarget', () => {
  it('normalises an internal path', () => {
    expect(parseRedirectTarget('/bn/a/')).toEqual({ kind: 'internal', path: '/bn/a' })
  })

  /**
   * An editable redirect table is an open-redirect vector by construction. An
   * external destination is only allowed for a host somebody has approved.
   */
  it('rejects an external URL whose host is not allowed', () => {
    expect(parseRedirectTarget('https://evil.example/x')).toBeNull()
    expect(
      parseRedirectTarget('https://evil.example/x', { allowedHosts: ['dhakalive.example'] }),
    ).toBeNull()
  })

  it('accepts an external URL on an allowed host', () => {
    expect(
      parseRedirectTarget('https://archive.dhakalive.example/x', {
        allowedHosts: ['archive.dhakalive.example'],
      }),
    ).toEqual({ kind: 'external', url: 'https://archive.dhakalive.example/x' })
  })

  it('compares hosts case-insensitively', () => {
    expect(
      parseRedirectTarget('https://ARCHIVE.example/x', { allowedHosts: ['archive.example'] }),
    ).toEqual({ kind: 'external', url: 'https://archive.example/x' })
  })

  /** Rejected by the protocol allowlist, so an unfamiliar scheme fails closed. */
  it('rejects dangerous schemes', () => {
    for (const value of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'ftp://example.com/x',
    ]) {
      expect(parseRedirectTarget(value, { allowedHosts: ['example.com'] })).toBeNull()
    }
  })

  it('rejects a protocol-relative target', () => {
    expect(parseRedirectTarget('//evil.example/x', { allowedHosts: ['evil.example'] })).toBeNull()
  })

  it('rejects empty and non-string input', () => {
    expect(parseRedirectTarget('')).toBeNull()
    expect(parseRedirectTarget(undefined)).toBeNull()
  })
})

describe('followRedirectChain', () => {
  const chain = (map: Record<string, string>) => (path: string) => map[path] ?? null

  it('reports none when nothing matches', () => {
    expect(followRedirectChain('/a', chain({}))).toEqual({ status: 'none' })
  })

  it('resolves a single hop', () => {
    expect(followRedirectChain('/a', chain({ '/a': '/b' }))).toEqual({
      status: 'resolved',
      path: '/b',
      hops: 1,
    })
  })

  it('follows a chain to its end', () => {
    const result = followRedirectChain('/a', chain({ '/a': '/b', '/b': '/c', '/c': '/d' }))
    expect(result).toEqual({ status: 'resolved', path: '/d', hops: 3 })
  })

  it('detects a two-step cycle', () => {
    const result = followRedirectChain('/a', chain({ '/a': '/b', '/b': '/a' }))
    expect(result.status).toBe('loop')
  })

  it('detects a self-referential entry', () => {
    expect(followRedirectChain('/a', chain({ '/a': '/a' })).status).toBe('loop')
  })

  /**
   * A long chain and a cycle need different fixes, so they are reported
   * separately rather than both as "did not resolve".
   */
  it('reports an over-long chain distinctly from a loop', () => {
    const map: Record<string, string> = {}
    for (let index = 0; index < 12; index += 1) map[`/${index}`] = `/${index + 1}`

    const result = followRedirectChain('/0', chain(map), 5)
    expect(result.status).toBe('too-long')
  })

  it('respects a custom hop limit', () => {
    const map = { '/a': '/b', '/b': '/c' }
    expect(followRedirectChain('/a', chain(map), 1).status).toBe('too-long')
    expect(followRedirectChain('/a', chain(map), 2).status).toBe('resolved')
  })
})

describe('redirect permanence', () => {
  it('accepts the two kinds an editor may choose', () => {
    expect(isRedirectPermanence('permanent')).toBe(true)
    expect(isRedirectPermanence('temporary')).toBe(true)
  })

  it('rejects anything else, including raw status codes', () => {
    for (const value of [301, '301', 'forever', '', null, undefined]) {
      expect(isRedirectPermanence(value)).toBe(false)
    }
  })

  /**
   * The method-preserving pair, because that is what Next emits. Pinned so a
   * change to the mapping has to be deliberate.
   */
  it('maps each kind to the status code it actually produces', () => {
    expect(REDIRECT_STATUS.permanent).toBe(308)
    expect(REDIRECT_STATUS.temporary).toBe(307)
  })
})
