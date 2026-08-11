'use client'

import { useState } from 'react'

import type { Locale } from '@dhakalive/config'

import { dictionary } from '../lib/dictionary'

/**
 * Builds a shareable picture of a story, in the browser.
 *
 * A social card that a desk can post to Facebook or WhatsApp without opening a
 * design tool: headline, byline, the story's own photograph, the masthead.
 * Drawn on a canvas rather than assembled from HTML, because the alternatives
 * are worse — `html2canvas` re-implements a layout engine badly and gets
 * Bengali shaping wrong, and rendering it on the server would mean a headless
 * browser or a font pipeline on a box that is already short of CPU.
 *
 * The whole thing runs on the reader's machine and downloads from memory.
 * Nothing is uploaded, nothing is stored, and it costs the origin one image
 * request that it was already serving.
 */

/** 4:5. The tallest shape Facebook, Instagram and WhatsApp all show uncropped. */
const WIDTH = 1080
const HEIGHT = 1350
const PADDING = 64

const HEADLINE_MAX = 72
const HEADLINE_MIN = 40
const HEADLINE_LINES = 5

/**
 * Quotation marks, straight and curled, in both scripts.
 *
 * The highlight follows the quotation because that is the part of a headline
 * somebody actually said — the same reason the ingest is forbidden from
 * rewriting it. A headline with no quotation gets no highlight rather than an
 * arbitrary one.
 */
const QUOTED = /(["'“”‘’«»][^"'“”‘’«»]+["'“”‘’«»])/u

interface Segment {
  text: string
  highlighted: boolean
}

/** Splits a headline into the quoted run and everything around it. */
function segmentsFor(headline: string): Segment[] {
  const match = QUOTED.exec(headline)
  if (match?.index === undefined) return [{ text: headline, highlighted: false }]

  const before = headline.slice(0, match.index)
  const quote = match[0]
  const after = headline.slice(match.index + quote.length)

  return [
    ...(before ? [{ text: before, highlighted: false }] : []),
    { text: quote, highlighted: true },
    ...(after ? [{ text: after, highlighted: false }] : []),
  ]
}

/**
 * Wraps segmented text to a measured width.
 *
 * Word by word, on spaces, which Bengali uses between words as Latin does. It
 * cannot break inside a word — a Bengali conjunct split down the middle is not
 * a hyphenation, it is two different letters — so an unbroken run wider than
 * the measure overflows rather than being cut.
 */
function wrap(ctx: CanvasRenderingContext2D, segments: Segment[], maxWidth: number): Segment[][] {
  const lines: Segment[][] = []
  let line: Segment[] = []
  let width = 0

  for (const segment of segments) {
    for (const [index, word] of segment.text.split(/\s+/).filter(Boolean).entries()) {
      const piece = index === 0 && line.length === 0 ? word : ` ${word}`
      const pieceWidth = ctx.measureText(piece).width

      if (width + pieceWidth > maxWidth && line.length > 0) {
        lines.push(line)
        line = [{ text: word, highlighted: segment.highlighted }]
        width = ctx.measureText(word).width
        continue
      }

      const last = line[line.length - 1]
      if (last?.highlighted === segment.highlighted) last.text += piece
      else line.push({ text: piece, highlighted: segment.highlighted })
      width += pieceWidth
    }
  }

  if (line.length > 0) lines.push(line)
  return lines
}

/** Loads an image and refuses to hand back a tainted one. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    /*
     * No `crossOrigin`. The caller passes a same-origin path, which cannot taint
     * the canvas — and requesting it in CORS mode would put it in a separate
     * browser cache entry from the one the article page already filled.
     */
    image.onload = () => {
      resolve(image)
    }
    image.onerror = () => {
      reject(new Error('Image could not be loaded'))
    }
    image.src = src
  })
}

export function PhotoCard({
  headline,
  byline,
  imageUrl,
  siteName,
  locale,
}: {
  headline: string
  /** Desk and date, printed under the headline as the example papers set it. */
  byline: string
  /** The story's featured image, as a raw URL; the optimiser is asked for it here. */
  imageUrl: string | null
  siteName: string
  locale: Locale
}) {
  const d = dictionary(locale)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const build = async () => {
    setBusy(true)
    setFailed(false)

    try {
      const canvas = document.createElement('canvas')
      canvas.width = WIDTH
      canvas.height = HEIGHT
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('No 2D context')

      /*
       * Fonts must be loaded before the first measurement, not merely declared.
       * `ctx.measureText` against a face the browser has not fetched measures
       * the fallback, and every line then wraps to the wrong width.
       *
       * Loaded by the family alone. `FontFaceSet.load` matches on the family
       * name, so passing the whole stack — "SolaimanLipi, sans-serif" — matches
       * nothing and resolves to an empty list, which looks like success.
       */
      await Promise.all([
        document.fonts.load(`700 ${String(HEADLINE_MAX)}px SolaimanLipi`),
        document.fonts.load('400 28px SolaimanLipi'),
      ])

      // The fallback stays in the canvas font so Latin still renders if the
      // Bengali face is unavailable.
      const display = 'SolaimanLipi, sans-serif'

      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, WIDTH, HEIGHT)

      // Shrink the headline until it fits the lines it is allowed.
      const measure = WIDTH - PADDING * 2
      const segments = segmentsFor(headline)
      let size = HEADLINE_MAX
      let lines: Segment[][] = []

      for (; size >= HEADLINE_MIN; size -= 2) {
        ctx.font = `700 ${String(size)}px ${display}`
        lines = wrap(ctx, segments, measure)
        if (lines.length <= HEADLINE_LINES) break
      }

      const lineHeight = size * 1.25
      let y = PADDING + size

      for (const line of lines) {
        let x = PADDING
        for (const segment of line) {
          const width = ctx.measureText(segment.text).width

          if (segment.highlighted) {
            ctx.fillStyle = '#2340eb'
            ctx.fillRect(x, y - size * 0.86, width, size * 1.12)
            ctx.fillStyle = '#ffffff'
          } else {
            ctx.fillStyle = '#000000'
          }

          ctx.fillText(segment.text, x, y)
          x += width
        }
        y += lineHeight
      }

      ctx.font = `400 28px ${display}`
      ctx.fillStyle = 'rgba(0,0,0,0.65)'
      ctx.fillText(byline, PADDING, y + 12)

      const imageTop = y + 56

      if (imageUrl) {
        /*
         * A relative URL, so this is always same-origin and the canvas is never
         * tainted — drawing the R2 address directly would throw a SecurityError
         * at `toBlob`, after the reader had already waited.
         *
         * Both parameters are constrained. `w` must be one of Next's configured
         * widths and `q` one of its configured qualities — 75 is the only one
         * by default, and anything else is refused with a 400. Matching what
         * the article page already requested also means the browser usually has
         * it in cache.
         */
        const optimised = `/_next/image?url=${encodeURIComponent(imageUrl)}&w=1080&q=75`
        const image = await loadImage(optimised)

        // Cover, not contain: a letterboxed press photograph looks like a
        // mistake, and the crop is the same one the article page shows.
        const boxHeight = HEIGHT - imageTop
        const scale = Math.max(WIDTH / image.width, boxHeight / image.height)
        const drawWidth = image.width * scale
        const drawHeight = image.height * scale

        ctx.drawImage(
          image,
          (WIDTH - drawWidth) / 2,
          imageTop + (boxHeight - drawHeight) / 2,
          drawWidth,
          drawHeight,
        )

        // The masthead, over a scrim so it survives a bright photograph.
        const gradient = ctx.createLinearGradient(0, HEIGHT - 180, 0, HEIGHT)
        gradient.addColorStop(0, 'rgba(0,0,0,0)')
        gradient.addColorStop(1, 'rgba(0,0,0,0.55)')
        ctx.fillStyle = gradient
        ctx.fillRect(0, HEIGHT - 180, WIDTH, 180)

        ctx.font = `700 34px ${display}`
        ctx.fillStyle = '#ffffff'
        ctx.fillText(siteName, PADDING, HEIGHT - PADDING)
      }

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/png')
      })
      if (!blob) throw new Error('Canvas produced no image')

      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      /*
       * Marks are kept, not only letters and digits. Bengali vowel signs are
       * combining marks, so stripping everything outside `\p{L}\p{N}` takes the
       * মাত্রা off every syllable and leaves a filename of bare consonants.
       */
      anchor.download = `${headline.slice(0, 60).replace(/[^\p{L}\p{N}\p{M}]+/gu, '-')}.png`
      anchor.click()

      /*
       * Revoked on a timer rather than on the next line. Several browsers read
       * the blob asynchronously after the click returns, and revoking
       * immediately cancels the download that was just started.
       */
      setTimeout(() => {
        URL.revokeObjectURL(url)
      }, 60_000)
    } catch {
      /*
       * Reported, because unlike a share link this is something the reader
       * asked for and waited on. A button that appears to do nothing is worse
       * than one that says it could not.
       */
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => void build()}
        disabled={busy}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--color-rule)] px-4 text-sm font-semibold text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] disabled:opacity-60"
      >
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3v12M7 11l5 5 5-5M4 20h16" />
        </svg>
        {busy ? d('cardBuilding') : d('downloadCard')}
      </button>

      {failed ? (
        <span role="status" className="text-sm text-[var(--color-brand)]">
          {d('cardFailed')}
        </span>
      ) : null}
    </span>
  )
}
