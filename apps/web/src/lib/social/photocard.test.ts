import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { CARD_HEIGHT, CARD_WIDTH, formatCardDate, renderPhotocard } from './photocard'

/**
 * Renders real cards. This exercises the pango text path inside libvips — the
 * part that differs between machines — so a container missing the bundled font
 * or a sharp build without text support fails here, not on the first publish.
 *
 * Each render lays out several pango text runs and encodes a full card, which
 * takes seconds on a loaded machine — hence the raised timeout.
 */
const RENDER_TIMEOUT_MS = 30_000

function testPhoto(): Promise<Buffer> {
  return sharp({
    create: { width: 1600, height: 900, channels: 3, background: '#3366aa' },
  })
    .jpeg()
    .toBuffer()
}

describe('renderPhotocard', () => {
  it(
    'produces a 1080x1350 JPEG',
    async () => {
      const card = await renderPhotocard({
        headline: 'ঢাকায় যুক্তাক্ষর পরীক্ষা: বিশ্ববিদ্যালয়ের শিক্ষার্থীদের আন্দোলন',
        photo: await testPhoto(),
        dateLabel: formatCardDate(new Date('2026-08-30T00:00:00Z')),
        siteLabel: 'dhakalive.com.bd',
      })

      const meta = await sharp(card).metadata()
      expect(meta.format).toBe('jpeg')
      expect(meta.width).toBe(CARD_WIDTH)
      expect(meta.height).toBe(CARD_HEIGHT)
    },
    RENDER_TIMEOUT_MS,
  )

  it(
    'fits a very long headline instead of overflowing the panel',
    async () => {
      // Same card dimensions regardless of headline length: the size steps down
      // until the wrapped block fits, so an overlong headline can only shrink.
      const card = await renderPhotocard({
        headline:
          'অত্যন্ত দীর্ঘ একটি শিরোনাম যা কয়েক লাইনে ভেঙে যাবে এবং প্যানেলের মধ্যে ফিট করার জন্য ছোট আকারে নামতে হবে, তবুও কার্ডের আকার একই থাকবে এবং কোনো লেখা উপচে পড়বে না',
        photo: await testPhoto(),
        dateLabel: formatCardDate(new Date('2026-08-30T00:00:00Z')),
        siteLabel: 'dhakalive.com.bd',
      })

      const meta = await sharp(card).metadata()
      expect(meta.width).toBe(CARD_WIDTH)
      expect(meta.height).toBe(CARD_HEIGHT)
    },
    RENDER_TIMEOUT_MS,
  )

  it(
    'renders the breaking variant at the same dimensions',
    async () => {
      const card = await renderPhotocard({
        headline: 'ব্রেকিং: বড় খবর',
        photo: await testPhoto(),
        dateLabel: '৩০ আগস্ট, ২০২৬',
        siteLabel: 'dhakalive.com',
        categoryLabel: 'জাতীয়',
        isBreaking: true,
      })

      const meta = await sharp(card).metadata()
      expect(meta.width).toBe(CARD_WIDTH)
      expect(meta.height).toBe(CARD_HEIGHT)
    },
    RENDER_TIMEOUT_MS,
  )

  it(
    'escapes markup characters in headlines',
    async () => {
      // An ampersand or angle bracket in a headline is editorial text, not pango
      // markup; the render must survive it rather than fail at post time.
      const card = await renderPhotocard({
        headline: 'R&D <বাজেট> বৃদ্ধি',
        photo: await testPhoto(),
        dateLabel: '৩০ আগস্ট, ২০২৬',
        siteLabel: 'dhakalive.com.bd',
      })

      expect(card.length).toBeGreaterThan(0)
    },
    RENDER_TIMEOUT_MS,
  )
})

describe('formatCardDate', () => {
  it('formats in Bengali', () => {
    const label = formatCardDate(new Date('2026-08-30T12:00:00Z'))
    expect(label).toMatch(/[০-৯]/)
    expect(label).toContain('২০২৬')
  })
})
