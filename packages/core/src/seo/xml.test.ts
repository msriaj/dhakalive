import { describe, expect, it } from 'vitest'

import { escapeXml, sanitiseXmlText, sitemapIndex, urlset, xmlText } from './xml.js'

describe('escapeXml', () => {
  it('escapes all five predefined entities', () => {
    expect(escapeXml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&apos;')
  })

  it('escapes the ampersand first, so entities are not double-escaped', () => {
    expect(escapeXml('a & b < c')).toBe('a &amp; b &lt; c')
    expect(escapeXml('&amp;')).toBe('&amp;amp;')
  })

  it('leaves Bengali text alone', () => {
    expect(escapeXml('বাজেট অধিবেশন')).toBe('বাজেট অধিবেশন')
  })
})

describe('sanitiseXmlText', () => {
  it('removes control characters XML cannot represent', () => {
    expect(sanitiseXmlText('a\u0000b\u0008c')).toBe('abc')
  })

  it('keeps tab, newline and carriage return, which are legal', () => {
    expect(sanitiseXmlText('a\tb\nc\rd')).toBe('a\tb\nc\rd')
  })

  it('removes the non-characters at the end of the BMP', () => {
    expect(sanitiseXmlText('a\ufffeb\uffffc')).toBe('abc')
  })
})

describe('urlset', () => {
  it('emits a declaration and the sitemap namespace', () => {
    const xml = urlset([{ loc: 'https://example.test/a' }])
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"')
  })

  it('declares extra namespaces only when asked', () => {
    const plain = urlset([{ loc: 'https://example.test/a' }])
    expect(plain).not.toContain('sitemap-news')
    expect(plain).not.toContain('sitemap-image')

    const rich = urlset([{ loc: 'https://example.test/a' }], {
      news: true,
      images: true,
      alternates: true,
    })
    expect(rich).toContain('xmlns:news=')
    expect(rich).toContain('xmlns:image=')
    expect(rich).toContain('xmlns:xhtml=')
  })

  /** A single unescaped `&` makes the whole document unparseable. */
  it('escapes URLs containing query separators', () => {
    const xml = urlset([{ loc: 'https://example.test/a?x=1&y=2' }])
    expect(xml).toContain('<loc>https://example.test/a?x=1&amp;y=2</loc>')
  })

  it('escapes editorial text in news titles', () => {
    const xml = urlset(
      [
        {
          loc: 'https://example.test/a',
          news: {
            publicationName: 'DhakaLive & Co',
            language: 'en',
            publicationDate: '2026-08-10T09:00:00.000Z',
            title: 'Trade "deal" collapses <again>',
          },
        },
      ],
      { news: true },
    )

    expect(xml).toContain('<news:name>DhakaLive &amp; Co</news:name>')
    expect(xml).toContain('Trade &quot;deal&quot; collapses &lt;again&gt;')
  })

  it('normalises lastmod to ISO and drops unparseable dates', () => {
    expect(urlset([{ loc: 'https://e.test/a', lastmod: '2026-08-10' }])).toContain(
      '<lastmod>2026-08-10T00:00:00.000Z</lastmod>',
    )
    expect(urlset([{ loc: 'https://e.test/a', lastmod: 'not a date' }])).not.toContain('<lastmod>')
    expect(urlset([{ loc: 'https://e.test/a', lastmod: null }])).not.toContain('<lastmod>')
  })

  it('formats priority to one decimal place', () => {
    expect(urlset([{ loc: 'https://e.test/a', priority: 1 }])).toContain('<priority>1.0</priority>')
    expect(urlset([{ loc: 'https://e.test/a', priority: 0.64 }])).toContain(
      '<priority>0.6</priority>',
    )
  })

  it('omits priority entirely when it is not set', () => {
    expect(urlset([{ loc: 'https://e.test/a' }])).not.toContain('<priority>')
  })

  it('emits hreflang alternates', () => {
    const xml = urlset(
      [
        {
          loc: 'https://e.test/bn/a',
          alternates: [
            { hreflang: 'bn', href: 'https://e.test/bn/a' },
            { hreflang: 'en', href: 'https://e.test/en/a' },
          ],
        },
      ],
      { alternates: true },
    )

    expect(xml).toContain('<xhtml:link rel="alternate" hreflang="bn" href="https://e.test/bn/a"/>')
    expect(xml).toContain('hreflang="en"')
  })

  it('produces an empty but valid document for no entries', () => {
    const xml = urlset([])
    expect(xml).toContain('<urlset')
    expect(xml).toContain('</urlset>')
    expect(xml).not.toContain('<url>')
  })

  it('keeps Bengali slugs readable rather than escaping them', () => {
    const xml = urlset([{ loc: 'https://e.test/bn/মেট্রোরেল' }])
    expect(xml).toContain('মেট্রোরেল')
  })
})

describe('sitemapIndex', () => {
  it('lists child sitemaps', () => {
    const xml = sitemapIndex([
      { loc: 'https://e.test/sitemaps/news.xml', lastmod: '2026-08-10T09:00:00.000Z' },
      { loc: 'https://e.test/sitemaps/articles-1.xml' },
    ])

    expect(xml).toContain('<sitemapindex')
    expect(xml).toContain('<loc>https://e.test/sitemaps/news.xml</loc>')
    expect(xml).toContain('<lastmod>2026-08-10T09:00:00.000Z</lastmod>')
    // The second entry has no lastmod and must not borrow the first one's.
    expect(xml.match(/<lastmod>/g)).toHaveLength(1)
  })
})

describe('xmlText', () => {
  it('sanitises and escapes together', () => {
    expect(xmlText('a\u0000 & b')).toBe('a &amp; b')
  })
})
