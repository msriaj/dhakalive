import { describe, expect, it } from 'vitest'

import {
  IngestParseError,
  categoryFromUrl,
  externalIdFromUrl,
  fullSizeImageUrl,
  imageFilename,
  parseDetail,
  parseListing,
} from './source.js'

const BASE = 'https://unb.com.bd'

/**
 * A listing card, reduced from the real markup to the parts the parser reads.
 *
 * The HTML comment is kept because it is the only absolute timestamp on the
 * page — the visible one is the relative "৪ ঘণ্টা আগে" beside it — and dropping
 * it from the fixture would let a regression in comment handling go unnoticed.
 */
const CARD = `
<div class="news-block-four">
  <div class="inner-box"><div class="row clearfix">
    <div class="image-column">
      <div class="image">
        <a href="https://unb.com.bd/bangla/category/%E0%A6%B8%E0%A6%BE%E0%A6%B0%E0%A6%BE%E0%A6%A6%E0%A7%87%E0%A6%B6/test-story/114337">
          <img src="https://unb.com.bd/compressed?url=https://cosmosgroup.sgp1.digitaloceanspaces.com/bn_news/3554488.webp&amp;width=370&amp;height=194" alt="x">
        </a>
      </div>
    </div>
    <div class="content-box"><div class="content-inner">
      <h3>
        <a href="https://unb.com.bd/bangla/category/%E0%A6%B8%E0%A6%BE%E0%A6%B0%E0%A6%BE%E0%A6%A6%E0%A7%87%E0%A6%B6/test-story/114337">
          সাভারে ছাত্রদল নেতাকে হত্যা
        </a>
      </h3>
      <div class="text truncate-4">সংক্ষিপ্ত বিবরণ।</div>
      <p class="human_readable_format">৪ ঘণ্টা আগে</p>
      <!--   2026-08-10 19:18:11 -->
    </div></div>
  </div></div>
</div>`

/** The article body, with the AdSense unit that sits beside it inside `.text`. */
const DETAIL_PAGE = `
<div class="text">
  <div class="news-article-text-block text-patter-edit ref-link">
    <p>কুমিল্লা শিক্ষা বোর্ডে ফলাফলের দিক থেকে শীর্ষ স্থান দখল করেছে ফেনী জেলা।</p>
    <p>ফেনী গার্লস ক্যাডেট কলেজে ৫৬ জন শিক্ষার্থী পরীক্ষায় অংশ নিয়েছে।&nbsp;</p>
    <p>   </p>
  </div>
  <div class="fullwidth-add text-center hidden-xs">
    <div class="image ads">
      <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"></script>
      <ins class="adsbygoogle" data-ad-client="ca-pub-9190890588884247"></ins>
      <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
    </div>
  </div>
</div>`

describe('URL parsing', () => {
  it('takes the identity from the trailing numeric segment, not the slug', () => {
    // The slug carries the headline, which upstream can correct; the id cannot.
    expect(externalIdFromUrl('https://unb.com.bd/bangla/category/x/some-slug/114337')).toBe(
      '114337',
    )
    expect(externalIdFromUrl('https://unb.com.bd/bangla/no-id-here')).toBeNull()
  })

  it('percent-decodes the Bengali section from the path', () => {
    const url = `${BASE}/bangla/category/%E0%A6%B8%E0%A6%BE%E0%A6%B0%E0%A6%BE%E0%A6%A6%E0%A7%87%E0%A6%B6/slug/1`
    expect(categoryFromUrl(url)).toBe('সারাদেশ')
  })

  it('drops the size constraints but keeps the proxy', () => {
    const proxied =
      'https://unb.com.bd/compressed?url=https://cosmos.example/bn_news/3554488.webp&width=370&height=194'

    // Keeping width/height would make a 370px thumbnail the featured image of
    // every story. Going straight to the inner asset instead would leave us
    // fetching someone else's object storage without their front door, which
    // they are free to refuse.
    expect(fullSizeImageUrl(proxied, BASE)).toBe(
      'https://unb.com.bd/compressed?url=https://cosmos.example/bn_news/3554488.webp',
    )
  })

  it('leaves the wrapped URL unencoded, as the proxy emitted it', () => {
    const proxied = 'https://unb.com.bd/compressed?url=https://cosmos.example/a.webp&width=10'

    expect(fullSizeImageUrl(proxied, BASE)).not.toContain('%3A')
  })

  it('resolves a relative proxy path against the listing page', () => {
    expect(fullSizeImageUrl('/compressed?url=https://cosmos.example/a.webp&width=10', BASE)).toBe(
      'https://unb.com.bd/compressed?url=https://cosmos.example/a.webp',
    )
  })

  it('names a stored file after the wrapped asset, not the proxy endpoint', () => {
    // The proxy's own path is `/compressed`, so reading it would name every
    // uploaded image `compressed`.
    expect(
      imageFilename('https://unb.com.bd/compressed?url=https://cosmos.example/bn/3554488.webp'),
    ).toBe('3554488.webp')

    expect(imageFilename('https://cosmos.example/bn/a.webp')).toBe('a.webp')
    expect(imageFilename('not a url')).toBe('ingested-image')
  })

  it('passes through an unproxied absolute URL and rejects nothing usable', () => {
    expect(fullSizeImageUrl('https://cosmos.example/a.webp', BASE)).toBe(
      'https://cosmos.example/a.webp',
    )
    expect(fullSizeImageUrl(undefined, BASE)).toBeNull()
  })
})

describe('parseListing', () => {
  it('reads every field the pipeline needs off one card', () => {
    const [item] = parseListing(CARD, BASE)

    expect(item).toMatchObject({
      externalId: '114337',
      title: 'সাভারে ছাত্রদল নেতাকে হত্যা',
      summary: 'সংক্ষিপ্ত বিবরণ।',
      imageUrl:
        'https://unb.com.bd/compressed?url=https://cosmosgroup.sgp1.digitaloceanspaces.com/bn_news/3554488.webp',
      sourceCategory: 'সারাদেশ',
    })
  })

  it('reads the absolute timestamp from the comment, as Dhaka time', () => {
    const [item] = parseListing(CARD, BASE)

    // Not the visible "৪ ঘণ্টা আগে", and not UTC — reading it as UTC would date
    // every story six hours early and quietly reorder the front page.
    expect(item?.publishedAt).toBe('2026-08-10T19:18:11+06:00')
  })

  it('drops the same story appearing in more than one block', () => {
    expect(parseListing(CARD + CARD, BASE)).toHaveLength(1)
  })

  it('skips a card with no story link rather than inventing an identity', () => {
    expect(
      parseListing('<div class="news-block-four"><div class="text">x</div></div>', BASE),
    ).toHaveLength(0)
  })
})

describe('parseDetail', () => {
  const item = parseListing(CARD, BASE)[0]!

  it('reads the body paragraphs in document order', () => {
    const detail = parseDetail(DETAIL_PAGE, item)

    expect(detail.paragraphs).toHaveLength(2)
    expect(detail.paragraphs[0]).toContain('ফেনী জেলা')
  })

  /**
   * The reason the body selector is `.news-article-text-block` and not its
   * `.text` parent: the parent also holds the AdSense unit, and ad markup handed
   * to the model as reporting is how an advertisement ends up rewritten as news.
   */
  it('keeps advertising markup out of the paragraphs', () => {
    const body = parseDetail(DETAIL_PAGE, item).paragraphs.join(' ')

    expect(body).not.toContain('adsbygoogle')
    expect(body).not.toContain('pagead')
  })

  it('drops empty paragraphs and collapses non-breaking spaces', () => {
    const detail = parseDetail(DETAIL_PAGE, item)

    expect(detail.paragraphs.every((text) => text.trim().length > 0)).toBe(true)
    expect(detail.paragraphs.join('')).not.toContain('\u00a0')
  })

  it('carries the listing record through unchanged', () => {
    expect(parseDetail(DETAIL_PAGE, item)).toMatchObject({
      externalId: '114337',
      sourceCategory: 'সারাদেশ',
    })
  })

  it('throws rather than publishing an empty article when the markup changes', () => {
    expect(() => parseDetail('<div class="something-else"><p>x</p></div>', item)).toThrow(
      IngestParseError,
    )
    expect(() => parseDetail('<div class="news-article-text-block"></div>', item)).toThrow(
      IngestParseError,
    )
  })
})
