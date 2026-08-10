import { describe, expect, it } from 'vitest'

import {
  CRAWLER_CACHE,
  HOME_CACHE,
  NO_STORE,
  PUBLIC_CACHE,
  ROBOTS_CACHE,
  cacheHeaderRules,
} from './cache-policy'

/**
 * These assertions encode the cache-security requirements directly: authenticated
 * surfaces must never be publicly cacheable, and no route may receive two
 * conflicting `Cache-Control` headers.
 */

const rules = cacheHeaderRules()

function ruleFor(source: string) {
  return rules.find((rule) => rule.source === source)
}

function cacheControlOf(source: string): string | undefined {
  return ruleFor(source)?.headers.find((header) => header.key === 'Cache-Control')?.value
}

/** Crude matcher mirroring Next's path-to-regexp semantics closely enough. */
function matches(source: string, path: string): boolean {
  const pattern = source
    .replace(':locale(bn|en)', '(?:bn|en)')
    .replace(/:path\(\(\?!search\$\)\.\*\)/, '(?!search$).*')
    .replace(/:path\*/g, '.*')
  return new RegExp(`^${pattern}$`).test(path)
}

describe('authenticated surfaces', () => {
  it.each(['/api/:path*', '/admin/:path*'])('%s is never publicly cacheable', (source) => {
    const value = cacheControlOf(source)
    expect(value).toBe(NO_STORE)
    expect(value).toContain('private')
    expect(value).toContain('no-store')
    expect(value).not.toContain('public')
    expect(value).not.toContain('s-maxage')
  })

  it('covers every API path, including Payload REST and GraphQL', () => {
    for (const path of ['/api/users', '/api/articles/1', '/api/graphql', '/api/health']) {
      expect(matches('/api/:path*', path)).toBe(true)
    }
  })
})

describe('search', () => {
  it('is not cached and not indexed', () => {
    const rule = ruleFor('/:locale(bn|en)/search')
    expect(rule?.headers).toContainEqual({ key: 'Cache-Control', value: NO_STORE })
    expect(rule?.headers).toContainEqual({ key: 'X-Robots-Tag', value: 'noindex, follow' })
  })

  it('is excluded from the general public rule', () => {
    // Two Cache-Control headers on one response is the failure this prevents.
    expect(matches('/:locale(bn|en)/:path((?!search$).*)', '/bn/search')).toBe(false)
    expect(matches('/:locale(bn|en)/:path((?!search$).*)', '/bn/politics')).toBe(true)
  })
})

describe('public pages', () => {
  it('caches the home page for a shorter window than articles', () => {
    const home = Number(/s-maxage=(\d+)/.exec(HOME_CACHE)?.[1])
    const rest = Number(/s-maxage=(\d+)/.exec(PUBLIC_CACHE)?.[1])
    expect(home).toBeLessThan(rest)
  })

  it('allows the edge to serve stale content while refreshing', () => {
    // Without this a slow origin becomes a slow page for every reader.
    expect(HOME_CACHE).toContain('stale-while-revalidate')
    expect(PUBLIC_CACHE).toContain('stale-while-revalidate')
  })

  it('keeps browser caching at zero so readers always revalidate', () => {
    // Shared caches hold the page; the browser must not, or a correction would
    // be invisible to anyone who already loaded the article.
    expect(HOME_CACHE).toContain('max-age=0')
    expect(PUBLIC_CACHE).toContain('max-age=0')
  })
})

describe('crawler files', () => {
  it('caches robots, the sitemap index and its shards', () => {
    // These sit outside the locale prefix, so they need their own rules or they
    // fall through to Next's dynamic default of no-store and every crawler hit
    // reaches the database.
    for (const source of ['/robots.txt', '/sitemap.xml', '/sitemaps/:path*']) {
      const value = cacheControlOf(source)
      expect(value, `${source} has no cache policy`).toBeDefined()
      expect(value).toContain('public')
      expect(value).toContain('s-maxage')
    }
  })

  it('caches robots for longer than the sitemap, since it changes least', () => {
    const robots = Number(/s-maxage=(\d+)/.exec(ROBOTS_CACHE)?.[1])
    const sitemap = Number(/s-maxage=(\d+)/.exec(CRAWLER_CACHE)?.[1])
    expect(robots).toBeGreaterThan(sitemap)
  })
})

describe('rule set', () => {
  it('gives every rule exactly one Cache-Control header', () => {
    for (const rule of rules) {
      const count = rule.headers.filter((header) => header.key === 'Cache-Control').length
      expect(count, `${rule.source} has ${count} Cache-Control headers`).toBe(1)
    }
  })

  it('never applies two rules to the same path', () => {
    const paths = [
      '/bn',
      '/en',
      '/bn/politics',
      '/bn/politics/some-article',
      '/bn/search',
      '/bn/archive/2026/08/10',
      '/api/articles',
      '/admin/collections/articles',
      '/robots.txt',
      '/sitemap.xml',
      '/sitemaps/articles-1.xml',
      '/bn/rss.xml',
    ]

    for (const path of paths) {
      const matched = rules.filter((rule) => matches(rule.source, path))
      expect(matched.length, `${path} matched ${matched.length} rules`).toBeLessThanOrEqual(1)
    }
  })
})
