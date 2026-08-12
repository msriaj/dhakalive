import { describe, expect, it } from 'vitest'

import {
  localeRedirects,
  localeRewrites,
  toRoutePath,
  unprefixedPathMatcher,
} from './locale-routing'

/**
 * The rewrite runs before the filesystem, so its exclusion list is the only
 * thing standing between a request for `/_next/static/…` and a 404 where the
 * stylesheet should be. These assertions exist because that failure would not
 * break a build, a type check or a lint — it would break the live site.
 */

/** Mirrors how Next compiles `/:path(<regex>)`. */
function matcher(source: string): RegExp {
  const inner = /^\/:path\((.*)\)$/.exec(source)?.[1]
  if (!inner) throw new Error(`Not a single-parameter source: ${source}`)
  // Capturing, so a test can assert what Next would substitute for `:path`.
  return new RegExp(`^/(${inner})$`)
}

const rewrite = localeRewrites()[0]!
const rewrites = matcher(rewrite.source)

describe('the unprefixed rewrite', () => {
  it('sends reader-facing paths to the Bengali route tree', () => {
    for (const path of [
      '/',
      '/রাজনীতি',
      '/রাজনীতি/story-slug',
      '/tag/budget',
      '/author/rafiq-ahmed',
      '/archive/2026/08/10',
      '/live/election-night',
      '/search',
      '/rss.xml',
    ]) {
      expect(rewrites.test(path), `${path} should be rewritten`).toBe(true)
    }
  })

  it('leaves infrastructure paths alone', () => {
    for (const path of [
      '/_next/static/chunk.css',
      '/api/health',
      '/api',
      '/admin',
      '/admin/collections/articles',
      '/sitemap.xml',
      '/sitemaps/articles-1.xml',
      '/robots.txt',
      '/icon.svg',
      '/fonts/solaimanlipi-400.woff2',
    ]) {
      expect(rewrites.test(path), `${path} must not be rewritten`).toBe(false)
    }
  })

  it('excludes whole segments, not prefixes', () => {
    // `/apiary` is a plausible story slug and must not be mistaken for the API.
    expect(rewrites.test('/apiary')).toBe(true)
    expect(rewrites.test('/administration')).toBe(true)
  })

  it('leaves the prefixed forms to the redirects', () => {
    // Rewriting these would produce `/bn/bn/…`.
    for (const path of ['/bn', '/bn/রাজনীতি', '/en', '/en/politics']) {
      expect(rewrites.test(path), `${path} must not be rewritten`).toBe(false)
    }
  })

  it('rewrites the root to the locale home rather than to a bare prefix', () => {
    expect(rewrite.destination).toBe('/bn/:path')
    // With an empty capture Next produces `/bn`, which is the locale home.
    expect(matcher(rewrite.source).exec('/')?.[1]).toBe('')
  })
})

describe('the extra exclusions callers can add', () => {
  it('are applied on top of the shared list', () => {
    const withSearch = matcher(unprefixedPathMatcher(['search$', '$']))
    expect(withSearch.test('/search')).toBe(false)
    expect(withSearch.test('/')).toBe(false)
    expect(withSearch.test('/রাজনীতি')).toBe(true)
    // Still excluded by the shared list.
    expect(withSearch.test('/api/health')).toBe(false)
  })
})

describe('redirects', () => {
  const rules = localeRedirects()

  it('permanently retires every prefixed URL', () => {
    // `/bn/…` is what is in the search index; a temporary redirect would leave
    // it there indefinitely.
    expect(rules.every((rule) => rule.permanent === true)).toBe(true)
    expect(rules).toContainEqual({ source: '/bn', destination: '/', permanent: true })
    expect(rules).toContainEqual({
      source: '/bn/:path*',
      destination: '/:path*',
      permanent: true,
    })
  })

  it('covers the unpublished locale too', () => {
    expect(rules).toContainEqual({ source: '/en', destination: '/', permanent: true })
  })
})

describe('toRoutePath', () => {
  it('maps a public URL onto the route that renders it', () => {
    // Next keys its route cache by this, Cloudflare by the argument.
    expect(toRoutePath('/')).toBe('/bn')
    expect(toRoutePath('/রাজনীতি')).toBe('/bn/রাজনীতি')
    expect(toRoutePath('/রাজনীতি/story')).toBe('/bn/রাজনীতি/story')
  })

  it('passes a prefixed locale through untouched', () => {
    expect(toRoutePath('/en')).toBe('/en')
    expect(toRoutePath('/en/politics')).toBe('/en/politics')
  })

  it('does not mistake a slug that merely starts with a locale code', () => {
    expect(toRoutePath('/energy')).toBe('/bn/energy')
    expect(toRoutePath('/bnp-rally')).toBe('/bn/bnp-rally')
  })
})
