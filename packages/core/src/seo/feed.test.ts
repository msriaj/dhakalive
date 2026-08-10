import { describe, expect, it } from 'vitest'

import { MAX_FEED_ITEMS, renderAtom, renderRss, type FeedChannel, type FeedItem } from './feed.js'

const channel: FeedChannel = {
  title: 'DhakaLive',
  description: 'News from Dhaka',
  siteUrl: 'https://dhakalive.example/bn',
  feedUrl: 'https://dhakalive.example/bn/rss.xml',
  language: 'bn',
}

const item: FeedItem = {
  url: 'https://dhakalive.example/bn/politics/budget',
  title: 'বাজেট অধিবেশন শুরু',
  summary: 'একটি কাল্পনিক প্রতিবেদন।',
  published: '2026-08-10T09:00:00.000Z',
  updated: '2026-08-10T10:00:00.000Z',
  authors: [{ name: 'নুসরাত রহমান', uri: 'https://dhakalive.example/bn/author/nusrat' }],
  categories: ['রাজনীতি'],
}

describe('renderRss', () => {
  it('produces a well-formed channel', () => {
    const xml = renderRss(channel, [item])
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain('<rss version="2.0"')
    expect(xml).toContain('<channel>')
    expect(xml).toContain('</channel></rss>')
  })

  /** RSS requires RFC 822; an ISO timestamp is silently rejected by readers. */
  it('formats dates as RFC 822', () => {
    const xml = renderRss(channel, [item])
    expect(xml).toContain('<pubDate>Mon, 10 Aug 2026 09:00:00 GMT</pubDate>')
    expect(xml).not.toContain('<pubDate>2026-08-10T09:00:00.000Z')
  })

  it('declares itself with an atom:link, so readers can find the canonical feed', () => {
    expect(renderRss(channel, [item])).toContain(
      '<atom:link href="https://dhakalive.example/bn/rss.xml" rel="self" type="application/rss+xml"/>',
    )
  })

  it('uses the article URL as a permalink guid', () => {
    expect(renderRss(channel, [item])).toContain(
      '<guid isPermaLink="true">https://dhakalive.example/bn/politics/budget</guid>',
    )
  })

  /** Publishing a journalist's email address is not what a byline implies. */
  it('attributes with dc:creator rather than RSS author, which needs an email', () => {
    const xml = renderRss(channel, [item])
    expect(xml).toContain('<dc:creator>নুসরাত রহমান</dc:creator>')
    expect(xml).not.toContain('<author>')
  })

  it('escapes editorial text', () => {
    const xml = renderRss(channel, [
      { ...item, title: 'Trade "deal" & <collapse>', summary: 'a & b' },
    ])
    expect(xml).toContain('<title>Trade &quot;deal&quot; &amp; &lt;collapse&gt;</title>')
    expect(xml).toContain('<description>a &amp; b</description>')
  })

  it('omits an enclosure with no byte length, which the spec requires', () => {
    const withoutLength = renderRss(channel, [
      { ...item, enclosure: { url: 'https://e.test/a.jpg', type: 'image/jpeg' } },
    ])
    expect(withoutLength).not.toContain('<enclosure')

    const withLength = renderRss(channel, [
      { ...item, enclosure: { url: 'https://e.test/a.jpg', type: 'image/jpeg', length: 1024 } },
    ])
    expect(withLength).toContain(
      '<enclosure url="https://e.test/a.jpg" type="image/jpeg" length="1024"/>',
    )
  })

  it('derives lastBuildDate from the newest item', () => {
    const older: FeedItem = {
      ...item,
      url: 'https://e.test/older',
      updated: '2026-08-01T00:00:00.000Z',
    }
    const xml = renderRss(channel, [older, item])
    expect(xml).toContain('<lastBuildDate>Mon, 10 Aug 2026 10:00:00 GMT</lastBuildDate>')
  })

  it('still emits a lastBuildDate for an empty feed', () => {
    expect(renderRss(channel, [])).toContain('<lastBuildDate>')
  })

  it('caps the item count', () => {
    const many = Array.from({ length: MAX_FEED_ITEMS + 20 }, (_entry, index) => ({
      ...item,
      url: `https://e.test/${index}`,
    }))
    expect(renderRss(channel, many).match(/<item>/g)).toHaveLength(MAX_FEED_ITEMS)
  })
})

describe('renderAtom', () => {
  it('produces a well-formed feed with a language', () => {
    const xml = renderAtom(channel, [item])
    expect(xml).toContain('<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="bn">')
    expect(xml.endsWith('</feed>')).toBe(true)
  })

  /** Atom requires ISO 8601 and rejects RFC 822 — the opposite of RSS. */
  it('formats dates as ISO 8601', () => {
    const xml = renderAtom(channel, [item])
    expect(xml).toContain('<published>2026-08-10T09:00:00.000Z</published>')
    expect(xml).toContain('<updated>2026-08-10T10:00:00.000Z</updated>')
  })

  it('falls back to the publication date for the mandatory updated element', () => {
    const xml = renderAtom(channel, [{ ...item, updated: null }])
    expect(xml).toContain('<updated>2026-08-10T09:00:00.000Z</updated>')
  })

  it('emits both self and alternate links', () => {
    const xml = renderAtom(channel, [item])
    expect(xml).toContain('rel="self" type="application/atom+xml"')
    expect(xml).toContain('rel="alternate" type="text/html" href="https://dhakalive.example/bn"')
  })

  it('carries an author name and profile URI', () => {
    const xml = renderAtom(channel, [item])
    expect(xml).toContain('<name>নুসরাত রহমান</name>')
    expect(xml).toContain('<uri>https://dhakalive.example/bn/author/nusrat</uri>')
  })

  it('escapes attribute values as well as text', () => {
    const xml = renderAtom(channel, [{ ...item, categories: ['a & b'] }])
    expect(xml).toContain('<category term="a &amp; b"/>')
  })

  it('caps the entry count', () => {
    const many = Array.from({ length: MAX_FEED_ITEMS + 5 }, (_entry, index) => ({
      ...item,
      url: `https://e.test/${index}`,
    }))
    expect(renderAtom(channel, many).match(/<entry>/g)).toHaveLength(MAX_FEED_ITEMS)
  })
})
