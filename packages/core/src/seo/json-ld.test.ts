import { describe, expect, it } from 'vitest'

import {
  breadcrumbSchema,
  collectionPageSchema,
  graph,
  newsArticleSchema,
  organizationId,
  organizationSchema,
  personSchema,
  webSiteSchema,
} from './json-ld.js'

const SITE = 'https://dhakalive.example'

describe('organizationSchema', () => {
  it('carries a stable @id derived from the site URL', () => {
    const node = organizationSchema({ name: 'DhakaLive', url: SITE })
    expect(node['@id']).toBe(`${SITE}/#organization`)
    expect(organizationId(`${SITE}/`)).toBe(`${SITE}/#organization`)
  })

  it('omits properties that have no value', () => {
    const node = organizationSchema({ name: 'DhakaLive', url: SITE, legalName: null, sameAs: [] })
    expect(node).not.toHaveProperty('legalName')
    expect(node).not.toHaveProperty('sameAs')
    expect(node).not.toHaveProperty('logo')
  })

  it('emits the logo as an ImageObject', () => {
    const node = organizationSchema({
      name: 'DhakaLive',
      url: SITE,
      logo: { url: `${SITE}/logo.png`, width: 600, height: 60 },
    })
    expect(node.logo).toEqual({
      '@type': 'ImageObject',
      url: `${SITE}/logo.png`,
      width: 600,
      height: 60,
    })
  })
})

describe('webSiteSchema', () => {
  it('references the organisation by id rather than repeating it', () => {
    const node = webSiteSchema({ name: 'DhakaLive', url: SITE })
    expect(node.publisher).toEqual({ '@id': `${SITE}/#organization` })
  })

  it('adds a SearchAction only when a template is supplied', () => {
    expect(webSiteSchema({ name: 'D', url: SITE })).not.toHaveProperty('potentialAction')

    const node = webSiteSchema({
      name: 'D',
      url: SITE,
      searchUrlTemplate: `${SITE}/bn/search?q={search_term_string}`,
    })
    expect(node.potentialAction).toMatchObject({
      '@type': 'SearchAction',
      'query-input': 'required name=search_term_string',
    })
  })
})

describe('breadcrumbSchema', () => {
  it('returns null for an empty trail', () => {
    expect(breadcrumbSchema([])).toBeNull()
  })

  it('numbers positions from one', () => {
    const node = breadcrumbSchema([
      { name: 'Home', url: `${SITE}/bn` },
      { name: 'Politics', url: `${SITE}/bn/politics` },
      { name: 'A story' },
    ])

    const items = node?.itemListElement as { position: number; name: string }[]
    expect(items.map((item) => item.position)).toEqual([1, 2, 3])
    expect(items.map((item) => item.name)).toEqual(['Home', 'Politics', 'A story'])
  })

  /** A final crumb pointing at the page it is on is the classic warning. */
  it('leaves the last crumb without an item, even when given a URL', () => {
    const node = breadcrumbSchema([
      { name: 'Home', url: `${SITE}/bn` },
      { name: 'A story', url: `${SITE}/bn/politics/a-story` },
    ])

    const items = node?.itemListElement as Record<string, unknown>[]
    expect(items[0]).toHaveProperty('item', `${SITE}/bn`)
    expect(items[1]).not.toHaveProperty('item')
  })
})

describe('newsArticleSchema', () => {
  const base = {
    headline: 'Budget session opens',
    url: `${SITE}/en/politics/budget`,
    siteUrl: SITE,
  }

  it('points mainEntityOfPage at its own canonical URL', () => {
    const node = newsArticleSchema(base)
    expect(node.mainEntityOfPage).toEqual({ '@type': 'WebPage', '@id': base.url })
  })

  it('references the publisher by id', () => {
    expect(newsArticleSchema(base).publisher).toEqual({ '@id': `${SITE}/#organization` })
  })

  it('truncates headlines over 110 characters, which consumers reject', () => {
    const long = 'x'.repeat(200)
    const node = newsArticleSchema({ ...base, headline: long })
    expect(String(node.headline)).toHaveLength(110)
    expect(String(node.headline).endsWith('…')).toBe(true)
  })

  it('leaves a headline at the limit alone', () => {
    const exact = 'x'.repeat(110)
    expect(newsArticleSchema({ ...base, headline: exact }).headline).toBe(exact)
  })

  it('keeps Bengali headlines intact', () => {
    const node = newsArticleSchema({ ...base, headline: 'বাজেট অধিবেশন শুরু' })
    expect(node.headline).toBe('বাজেট অধিবেশন শুরু')
  })

  /**
   * A missing `dateModified` reads as "never updated", which is wrong for a
   * story that carries a correction.
   */
  it('falls back to the publication date for dateModified', () => {
    const node = newsArticleSchema({ ...base, datePublished: '2026-08-10T09:00:00.000Z' })
    expect(node.dateModified).toBe('2026-08-10T09:00:00.000Z')
  })

  it('prefers an explicit dateModified', () => {
    const node = newsArticleSchema({
      ...base,
      datePublished: '2026-08-10T09:00:00.000Z',
      dateModified: '2026-08-11T09:00:00.000Z',
    })
    expect(node.dateModified).toBe('2026-08-11T09:00:00.000Z')
  })

  it('defaults isAccessibleForFree to true and respects an override', () => {
    expect(newsArticleSchema(base).isAccessibleForFree).toBe(true)
    expect(newsArticleSchema({ ...base, isAccessibleForFree: false }).isAccessibleForFree).toBe(
      false,
    )
  })

  it('emits authors as Person nodes', () => {
    const node = newsArticleSchema({
      ...base,
      authors: [{ name: 'Nusrat Rahman', url: `${SITE}/en/author/nusrat` }],
    })
    expect(node.author).toEqual([
      { '@type': 'Person', name: 'Nusrat Rahman', url: `${SITE}/en/author/nusrat` },
    ])
  })

  it('omits empty image and keyword lists', () => {
    const node = newsArticleSchema({ ...base, images: [], keywords: [] })
    expect(node).not.toHaveProperty('image')
    expect(node).not.toHaveProperty('keywords')
  })
})

describe('personSchema', () => {
  it('keeps only the properties that were supplied', () => {
    expect(personSchema({ name: 'Farida Haque' })).toEqual({
      '@type': 'Person',
      name: 'Farida Haque',
    })
  })
})

describe('collectionPageSchema', () => {
  it('links the listing to the website node', () => {
    const node = collectionPageSchema({
      name: 'Politics',
      url: `${SITE}/bn/politics`,
      siteUrl: SITE,
    })
    expect(node.isPartOf).toEqual({ '@id': `${SITE}/#website` })
  })
})

describe('graph', () => {
  it('wraps nodes in a single @context document', () => {
    const document = graph(organizationSchema({ name: 'D', url: SITE }), null, undefined)
    expect(document['@context']).toBe('https://schema.org')
    expect(document['@graph']).toHaveLength(1)
  })

  it('drops absent nodes rather than emitting holes', () => {
    expect(graph(null, undefined)['@graph']).toEqual([])
  })
})
