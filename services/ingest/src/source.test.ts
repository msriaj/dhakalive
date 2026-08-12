import { describe, expect, it } from 'vitest'

import {
  IngestParseError,
  categoryFromUrl,
  externalIdFromUrl,
  fullSizeImageUrl,
  imageFilename,
  imageIdentity,
  isStale,
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
/**
 * A story body in the shape upstream actually publishes it: several text
 * blocks, split by the inline images and the ad slot that sit between them.
 * The block count tracks how many pictures the desk attached, so a fixture with
 * one block cannot catch a parser that reads one block.
 */
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
  <div class="news-article-text-block text-patter-edit ref-link">
    <p>বোর্ডের অধীনে মোট পাসের হার ছিল ৮২ দশমিক ৪ শতাংশ।</p>
  </div>
  <div class="image">
    <img class="news-details-image" src="https://cosmosgroup.sgp1.digitaloceanspaces.com/bn_news/details/1.webp" alt="ফলাফল">
    <div class="caption-border"><span class="news-caption">ফল হাতে শিক্ষার্থীরা। ছবি: সংগৃহীত</span></div>
  </div>
  <div class="news-article-text-block text-patter-edit ref-link">
    <p>আগামী সপ্তাহে পুনর্নিরীক্ষার আবেদন শুরু হবে বলে জানিয়েছে বোর্ড।</p>
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

  it('identifies a picture by the asset, not by how it is served', () => {
    const asset = 'https://cosmos.example/bn/3554488.webp'

    // Proxied, unproxied and resized are one photograph.
    expect(imageIdentity(`https://unb.com.bd/compressed?url=${asset}&width=370`)).toBe(
      imageIdentity(asset),
    )
    expect(imageIdentity(`https://unb.com.bd/compressed?url=${asset}&width=1200`)).toBe(
      imageIdentity(asset),
    )
    expect(imageIdentity(`${asset}?v=2`)).toBe(imageIdentity(asset))
  })

  it('keeps different assets apart, including same-named ones', () => {
    expect(imageIdentity('https://cosmos.example/a/photo.webp')).not.toBe(
      imageIdentity('https://cosmos.example/b/photo.webp'),
    )
    expect(imageIdentity('not a url')).toBe('not a url')
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

describe('isStale', () => {
  const now = Date.parse('2026-08-11T12:00:00+06:00')
  const at = (iso: string) => ({ publishedAt: iso })

  it('keeps a story inside the window and drops one outside it', () => {
    expect(isStale(at('2026-08-11T11:00:00+06:00'), 24, now)).toBe(false)
    expect(isStale(at('2026-08-10T13:00:00+06:00'), 24, now)).toBe(false)
    expect(isStale(at('2026-08-10T11:00:00+06:00'), 24, now)).toBe(true)
  })

  it('reads the offset rather than assuming UTC', () => {
    // 20:00 Dhaka on the 10th is 16 hours old, not 22. Treated as UTC it would
    // fall outside an 18-hour window while actually being inside it.
    expect(isStale(at('2026-08-10T20:00:00+06:00'), 18, now)).toBe(false)
  })

  /**
   * The timestamp is scraped out of an HTML comment. If upstream stops emitting
   * it, treating undated as old would stop the ingest dead — and silently, since
   * "no new stories" reads as a slow news day rather than a broken parser.
   */
  it('keeps a story it cannot date', () => {
    expect(isStale({ publishedAt: null }, 24, now)).toBe(false)
    expect(isStale(at('not a date'), 24, now)).toBe(false)
  })

  it('does not treat a future timestamp as stale', () => {
    expect(isStale(at('2026-08-11T18:00:00+06:00'), 24, now)).toBe(false)
  })
})

describe('parseDetail', () => {
  const item = parseListing(CARD, BASE)[0]!

  it('reads the body paragraphs in document order', () => {
    const detail = parseDetail(DETAIL_PAGE, item)

    expect(detail.paragraphs).toHaveLength(4)
    expect(detail.paragraphs[0]).toContain('ফেনী জেলা')
  })

  /**
   * Reading only the first block shipped the opening third of every long story
   * and dropped the rest. It stayed invisible because a truncated article still
   * rewrites into clean copy — there is no malformed output to notice.
   */
  it('reads every text block, not just the first', () => {
    const detail = parseDetail(DETAIL_PAGE, item)

    expect(detail.paragraphs[2]).toContain('৮২ দশমিক ৪ শতাংশ')
    expect(detail.paragraphs[3]).toContain('পুনর্নিরীক্ষার')
  })

  it('does not read the image caption as body text', () => {
    const body = parseDetail(DETAIL_PAGE, item).paragraphs.join(' ')

    expect(body).not.toContain('ছবি: সংগৃহীত')
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

  /**
   * Inline pictures sit between the text blocks, not inside them, so the body
   * selector alone could never reach them — every ingested story ran with the
   * lead photograph and nothing else, however many the desk had attached.
   */
  it('reads the inline images and their captions', () => {
    const detail = parseDetail(DETAIL_PAGE, item)

    expect(detail.inlineImages).toHaveLength(1)
    expect(detail.inlineImages[0]?.url).toContain('bn_news/details/1.webp')
    expect(detail.inlineImages[0]?.caption).toBe('ফল হাতে শিক্ষার্থীরা। ছবি: সংগৃহীত')
  })

  /**
   * The position is the point. A photograph two-thirds of the way down is
   * illustrating that part of the story, and a body that records only "there
   * were pictures" cannot put it back where its caption still makes sense.
   */
  it('keeps pictures in document order among the paragraphs', () => {
    const detail = parseDetail(DETAIL_PAGE, item)

    expect(detail.body.map((node) => node.type)).toEqual(['text', 'text', 'text', 'image', 'text'])
  })

  it('does not repeat the listing image inside the body', () => {
    const withLeadImageInBody = DETAIL_PAGE.replace(
      'https://cosmosgroup.sgp1.digitaloceanspaces.com/bn_news/details/1.webp',
      item.imageUrl ?? '',
    )

    expect(parseDetail(withLeadImageInBody, item).inlineImages).toHaveLength(0)
  })

  /**
   * The case the test above does not reach, and the one that actually happened.
   *
   * It substitutes the lead URL verbatim, so it only ever proved that identical
   * strings match. In production they are never identical: the lead is read
   * from the listing card, where the source proxies it, and the body is read
   * from the article page, where it is often the bare asset. The duplicate
   * passed the guard, was uploaded a second time as its own Media row, and
   * appeared as the hero and again as the first picture in the story.
   */
  it('does not repeat the lead image when the body serves the same asset directly', () => {
    const sameAssetUnproxied =
      'https://cosmosgroup.sgp1.digitaloceanspaces.com/bn_news/3554488.webp'
    const page = DETAIL_PAGE.replace(
      'https://cosmosgroup.sgp1.digitaloceanspaces.com/bn_news/details/1.webp',
      sameAssetUnproxied,
    )

    expect(parseDetail(page, item).inlineImages).toEqual([])
  })

  it('does not repeat the lead image at a different rendition', () => {
    const sameAssetOtherSize =
      'https://unb.com.bd/compressed?url=https://cosmosgroup.sgp1.digitaloceanspaces.com/bn_news/3554488.webp&amp;width=1200'
    const page = DETAIL_PAGE.replace(
      'https://cosmosgroup.sgp1.digitaloceanspaces.com/bn_news/details/1.webp',
      sameAssetOtherSize,
    )

    expect(parseDetail(page, item).inlineImages).toEqual([])
  })

  /**
   * The other half of the bargain. Matching on the asset rather than the URL
   * must not start discarding pictures that merely resemble the lead — a story
   * illustrated with two photographs should publish with two.
   */
  it('keeps a genuinely different picture', () => {
    expect(parseDetail(DETAIL_PAGE, item).inlineImages).toHaveLength(1)
  })

  /** The AdSense unit is also wrapped in a `.image` div. */
  it('does not read an advertisement as an inline image', () => {
    const detail = parseDetail(DETAIL_PAGE, item)

    expect(detail.inlineImages.every((image) => !image.url.includes('pagead'))).toBe(true)
  })
})
