import type { Locale } from '@dhakalive/config'
import { TYPE_KICKERS } from '@dhakalive/core'

import type { Article } from '../payload-types'

/**
 * How an article type is presented.
 *
 * Nine article types share one page, and until now they shared one appearance:
 * an editorial and a photo story arrived looking like the same wire report.
 * That is a claim about the content — it tells a reader that the masthead's own
 * argument and a straight news item carry the same authority — and it is the
 * wrong claim.
 *
 * Five treatments rather than nine, because the differences that matter are
 * about *kind* of reading, not about the label in the CMS. `feature` and
 * `analysis` want the same page; separating them would only produce two
 * near-identical stylesheets to keep in sync.
 */
export type ArticleLayout = 'report' | 'commentary' | 'longform' | 'interview' | 'visual'

const LAYOUT_BY_TYPE: Record<string, ArticleLayout> = {
  standard: 'report',
  'breaking-news': 'report',
  'live-blog': 'report',
  opinion: 'commentary',
  editorial: 'commentary',
  feature: 'longform',
  analysis: 'longform',
  interview: 'interview',
  'photo-story': 'visual',
  'video-story': 'visual',
}

export function layoutForType(type: Article['articleType'] | null | undefined): ArticleLayout {
  return (typeof type === 'string' ? LAYOUT_BY_TYPE[type] : undefined) ?? 'report'
}

export interface LayoutSpec {
  /** Measure. Long-form gets a wider column; commentary a narrower one. */
  container: string
  /**
   * The measure for everything above the body: headline, standfirst, byline and
   * the hero picture.
   *
   * Wider than the copy, deliberately. A headline is read in one glance rather
   * than line by line, so the 60-odd characters that suit body text force a
   * three-line headline where two would do — and the hero picture, set to the
   * same column, ends up smaller than the cards on the front page that led the
   * reader here. Prose keeps the narrow measure it needs.
   */
  headerContainer: string
  /**
   * `lead` runs the picture above the headline, `after` below the byline,
   * `none` drops it from the header entirely. Commentary uses `none` — an
   * opinion piece is a person's argument, and a stock photograph above it adds
   * the visual grammar of reporting to something that is not reporting.
   */
  hero: 'lead' | 'after' | 'none'
  heroAspect: string
  headline: string
  standfirst: string
  /** Extra class on the rich text, keyed to the `.prose-*` rules in globals.css. */
  prose: string
  /** Small type above the headline naming the register: OPINION, ANALYSIS. */
  showKicker: boolean
}

const SPECS: Record<ArticleLayout, LayoutSpec> = {
  report: {
    container: 'max-w-3xl',
    headerContainer: 'max-w-4xl',
    hero: 'after',
    heroAspect: 'aspect-[16/9]',
    headline: 'text-3xl leading-tight font-bold tracking-tight md:text-4xl',
    standfirst: 'mt-3 text-lg text-[var(--color-ink-muted)]',
    prose: '',
    showKicker: false,
  },

  /**
   * No picture, tighter measure, and the headline set in the body serif rather
   * than the display sans — the page should read as a column, not a bulletin.
   */
  commentary: {
    container: 'max-w-2xl',
    headerContainer: 'max-w-3xl',
    hero: 'none',
    heroAspect: 'aspect-[16/9]',
    headline:
      'font-[family-name:var(--font-body)] text-3xl leading-tight font-semibold md:text-4xl',
    standfirst: 'mt-3 font-[family-name:var(--font-body)] text-lg italic',
    prose: 'prose-commentary',
    showKicker: true,
  },

  longform: {
    container: 'max-w-3xl',
    headerContainer: 'max-w-4xl',
    hero: 'lead',
    heroAspect: 'aspect-[2/1]',
    headline: 'text-4xl leading-[1.08] font-bold tracking-tight md:text-5xl',
    standfirst: 'mt-4 text-xl leading-relaxed text-[var(--color-ink-muted)]',
    prose: 'prose-longform',
    showKicker: true,
  },

  interview: {
    container: 'max-w-2xl',
    headerContainer: 'max-w-3xl',
    hero: 'after',
    heroAspect: 'aspect-[3/2]',
    headline: 'text-3xl leading-tight font-bold tracking-tight md:text-4xl',
    standfirst: 'mt-3 text-lg text-[var(--color-ink-muted)]',
    prose: 'prose-interview',
    showKicker: true,
  },

  /**
   * The widest measure, because the pictures are the story and a 3xl column
   * would letterbox them into thumbnails.
   */
  visual: {
    container: 'max-w-5xl',
    headerContainer: 'max-w-5xl',
    hero: 'lead',
    heroAspect: 'aspect-[3/2]',
    headline: 'text-3xl leading-tight font-bold tracking-tight md:text-4xl',
    standfirst: 'mt-3 text-lg text-[var(--color-ink-muted)]',
    prose: 'prose-visual',
    showKicker: true,
  },
}

export function specForLayout(layout: ArticleLayout): LayoutSpec {
  return SPECS[layout]
}

/**
 * Kicker labels come from `@dhakalive/core`, not from `dictionary`.
 *
 * Two reasons. The key is only known at runtime, so a dynamic lookup into the
 * dictionary's typed object would defeat the compile-time check that makes a
 * missing UI string an error. And the ingest needs the same words to tell the
 * model that its chosen type prints one in front of the headline — the site and
 * the prompt disagreeing about that is how "ছবিতে ছবিতে" gets published.
 */
const TYPE_LABELS: Record<string, Record<Locale, string>> = Object.fromEntries(
  Object.entries(TYPE_KICKERS).flatMap(([type, label]) => (label ? [[type, label]] : [])),
)

export function typeLabel(
  type: Article['articleType'] | null | undefined,
  locale: Locale,
): string | null {
  if (typeof type !== 'string') return null
  return TYPE_LABELS[type]?.[locale] ?? null
}

/**
 * The label, unless the headline already opens with it.
 *
 * A photo story is labelled "ছবিতে" and its headline is very often written as
 * "ছবিতে বাজারের ভিড়" — so the card printed "ছবিতে ছবিতে বাজারের ভিড়", and the
 * same happened to "ভিডিও" and "মতামত". The writer is not at fault: the label
 * is applied at render time and is invisible while the headline is being
 * written, which is also why the ingest's prompt now says the label exists.
 *
 * Dropping the label rather than the word keeps the headline the editor wrote
 * intact, and a headline that already announces itself as a picture story needs
 * no second announcement.
 */
export function kickerFor(
  type: Article['articleType'] | null | undefined,
  headline: string | null | undefined,
  locale: Locale,
): string | null {
  const label = typeLabel(type, locale)
  if (!label) return null
  return typeof headline === 'string' && headline.trimStart().startsWith(label) ? null : label
}
