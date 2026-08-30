import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

/**
 * Photocard rendering.
 *
 * A photocard is the Facebook-native form of a news story in Bangladesh: the
 * photograph with the headline set on the image itself, branded, sized for the
 * feed. Links get throttled by the feed algorithm and previews get their crop
 * mangled; a photocard is the same pixels for every reader.
 *
 * Rendered with sharp because the worker already ships it. Text is laid out by
 * pango (via libvips's text input), which is what gets Bengali right: conjuncts
 * are built by GSUB substitution, and any renderer that places glyphs itself
 * turns every যুক্তাক্ষর into bare consonants with a visible hasant. The face is
 * the site's own SolaimanLipi, loaded from a file so the card renders
 * identically on a laptop and in the container without either installing fonts.
 */

/** 4:5, the tallest crop the Facebook feed shows uncropped. */
export const CARD_WIDTH = 1080
export const CARD_HEIGHT = 1350

const HEADER_HEIGHT = 108
const ACCENT_HEIGHT = 10
/** The photograph is the news; it gets the larger share of the card. */
const PHOTO_HEIGHT = 800
const PANEL_HEIGHT = CARD_HEIGHT - HEADER_HEIGHT - ACCENT_HEIGHT - PHOTO_HEIGHT

const MARGIN = 64
const TEXT_WIDTH = CARD_WIDTH - MARGIN * 2

/** Panel paddings around the headline block and the footer line. */
const PANEL_PAD = 32
const FOOTER_GAP = 44

/** The masthead red — the same value `app/icon.svg` states, for the same reason. */
const BRAND_RED = '#c4172a'
const PANEL_DARK = '#101418'

const FONT_FAMILY = 'SolaimanLipi'
/**
 * Resolved on first use, never at module scope.
 *
 * `import.meta.url` is not usable while Turbopack collects page data: the build
 * failed there first with "must be of type string or an instance of URL.
 * Received an instance of URL" — its `URL` is not Node's — and then, given the
 * href instead, with a plain "Invalid URL". Nothing about the value is
 * dependable at that moment.
 *
 * Nothing needs it at that moment either. This module is only reached through
 * the admin route's dependency graph during collection; the font is read when a
 * card is actually drawn, by which point the module is running in Node and
 * `import.meta.url` is an ordinary file URL again. Deferring the call is what
 * keeps a build-time concern from deciding whether the site builds at all.
 */
let fontFile: string | undefined

function fontPath(): string {
  fontFile ??= fileURLToPath(new URL('../../assets/fonts/solaimanlipi-700.ttf', import.meta.url))
  return fontFile
}

/** Masthead logo height inside the header band. */
const LOGO_HEIGHT = 48

let logoCache: { buffer: Buffer; width: number; height: number } | undefined

/**
 * The site logo, resized once and cached. Same deferred-path rule as the font
 * above, and for the same Turbopack reason.
 */
async function loadLogo() {
  if (!logoCache) {
    const path = fileURLToPath(new URL('../../assets/dhakalive-logo.png', import.meta.url))
    const buffer = await sharp(path).resize({ height: LOGO_HEIGHT }).png().toBuffer()
    const meta = await sharp(buffer).metadata()
    logoCache = { buffer, width: meta.width ?? 0, height: meta.height ?? LOGO_HEIGHT }
  }
  return logoCache
}

export interface PhotocardInput {
  headline: string
  /** Photograph bytes; any format sharp reads. Cover-cropped to the card. */
  photo: Buffer
  /** Already formatted for display, e.g. via `formatCardDate`. */
  dateLabel: string
  /** Shown in the panel footer, e.g. `dhakalive.com.bd`. */
  siteLabel: string
}

/** Bengali-locale date for the card header. */
export function formatCardDate(date: Date): string {
  return new Intl.DateTimeFormat('bn', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

/**
 * Pango escapes: the headline is editorial text dropped into markup, and an
 * ampersand in a headline must not become a parse error at post time.
 */
function escapeMarkup(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

interface TextOptions {
  text: string
  sizePx: number
  color: string
  width?: number
}

/**
 * Renders a run of text to a transparent PNG via pango.
 *
 * `dpi: 72` makes pango's point size equal to pixels, so `sizePx` means what it
 * says; `width` is the wrap width, and pango returns however many lines the
 * text needs at that size.
 */
async function renderText({ text, sizePx, color, width }: TextOptions) {
  const image = sharp({
    text: {
      text: `<span foreground="${color}" size="${sizePx * 1024}">${text}</span>`,
      font: FONT_FAMILY,
      fontfile: fontPath(),
      dpi: 72,
      rgba: true,
      ...(width ? { width } : {}),
    },
  })
  const buffer = await image.png().toBuffer()
  const meta = await sharp(buffer).metadata()
  return { buffer, width: meta.width ?? 0, height: meta.height ?? 0 }
}

/**
 * The headline block, sized to fit.
 *
 * Starts big — a one- or two-line headline should fill the panel the way a
 * front page would set it — and steps down until the wrapped block fits. A
 * headline that is still too tall at the floor size is rendered anyway: a
 * cramped card beats a job that can never succeed.
 */
async function renderHeadline(headline: string, maxHeight: number) {
  const smallerSizes = [60, 52, 46, 40, 34]
  const markup = escapeMarkup(headline.trim())

  let rendered = await renderText({ text: markup, sizePx: 68, color: '#ffffff', width: TEXT_WIDTH })
  for (const sizePx of smallerSizes) {
    if (rendered.height <= maxHeight) break
    rendered = await renderText({ text: markup, sizePx, color: '#ffffff', width: TEXT_WIDTH })
  }
  return rendered
}

/** Renders the finished card as a JPEG buffer. */
export async function renderPhotocard(input: PhotocardInput): Promise<Buffer> {
  const photo = await sharp(input.photo)
    .rotate() // honour EXIF orientation before it is stripped by re-encoding
    .resize(CARD_WIDTH, PHOTO_HEIGHT, { fit: 'cover', position: 'attention' })
    .toBuffer()

  const logo = await loadLogo()
  const date = await renderText({
    text: escapeMarkup(input.dateLabel),
    sizePx: 26,
    color: '#5b6470',
  })
  const footer = await renderText({
    text: escapeMarkup(input.siteLabel),
    sizePx: 24,
    color: '#c9d1d9',
  })

  const panelTop = HEADER_HEIGHT + PHOTO_HEIGHT + ACCENT_HEIGHT
  const footerTop = CARD_HEIGHT - FOOTER_GAP - footer.height

  /**
   * The headline is centred in the space between the accent bar and the footer
   * line, so a short headline sits balanced in the panel instead of hugging the
   * top with dead space below it.
   */
  const headlineAreaTop = panelTop + PANEL_PAD
  const headlineAreaHeight = footerTop - PANEL_PAD - headlineAreaTop
  const headline = await renderHeadline(input.headline, headlineAreaHeight)
  const headlineTop =
    headlineAreaTop + Math.max(0, Math.round((headlineAreaHeight - headline.height) / 2))

  /** Small brand-red dot in front of the footer line. */
  const footerDot = Buffer.from(
    `<svg width="14" height="14" xmlns="http://www.w3.org/2000/svg"><circle cx="7" cy="7" r="7" fill="${BRAND_RED}"/></svg>`,
  )

  return sharp({
    create: {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      channels: 3,
      background: '#ffffff',
    },
  })
    .composite([
      { input: photo, left: 0, top: HEADER_HEIGHT },
      {
        input: {
          create: { width: CARD_WIDTH, height: ACCENT_HEIGHT, channels: 3, background: BRAND_RED },
        },
        left: 0,
        top: HEADER_HEIGHT + PHOTO_HEIGHT,
      },
      {
        input: {
          create: { width: CARD_WIDTH, height: PANEL_HEIGHT, channels: 3, background: PANEL_DARK },
        },
        left: 0,
        top: panelTop,
      },
      // Header: logo left, date right, both vertically centred in the band.
      {
        input: logo.buffer,
        left: MARGIN,
        top: Math.round((HEADER_HEIGHT - logo.height) / 2),
      },
      {
        input: date.buffer,
        left: CARD_WIDTH - MARGIN - date.width,
        top: Math.round((HEADER_HEIGHT - date.height) / 2),
      },
      { input: headline.buffer, left: MARGIN, top: headlineTop },
      {
        input: footerDot,
        left: MARGIN,
        top: footerTop + Math.round((footer.height - 14) / 2),
      },
      { input: footer.buffer, left: MARGIN + 14 + 16, top: footerTop },
    ])
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer()
}
