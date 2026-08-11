import type { Locale } from '@dhakalive/config'

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
    hero: 'lead',
    heroAspect: 'aspect-[2/1]',
    headline: 'text-4xl leading-[1.08] font-bold tracking-tight md:text-5xl',
    standfirst: 'mt-4 text-xl leading-relaxed text-[var(--color-ink-muted)]',
    prose: 'prose-longform',
    showKicker: true,
  },

  interview: {
    container: 'max-w-2xl',
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
 * Kicker labels, kept here rather than in `dictionary` because the key is only
 * known at runtime — a dynamic lookup into that typed object would defeat the
 * compile-time check that makes a missing UI string an error.
 */
const TYPE_LABELS: Record<string, Record<Locale, string>> = {
  opinion: { bn: 'মতামত', en: 'Opinion' },
  editorial: { bn: 'সম্পাদকীয়', en: 'Editorial' },
  feature: { bn: 'ফিচার', en: 'Feature' },
  analysis: { bn: 'বিশ্লেষণ', en: 'Analysis' },
  interview: { bn: 'সাক্ষাৎকার', en: 'Interview' },
  'photo-story': { bn: 'ছবিতে', en: 'In pictures' },
  'video-story': { bn: 'ভিডিও', en: 'Video' },
}

export function typeLabel(
  type: Article['articleType'] | null | undefined,
  locale: Locale,
): string | null {
  if (typeof type !== 'string') return null
  return TYPE_LABELS[type]?.[locale] ?? null
}
