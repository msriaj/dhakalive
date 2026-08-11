/**
 * Editorial workflow vocabulary.
 *
 * Statuses and types are declared here as data so that the state machine, the
 * access rules, the Payload field options and the tests all read from one
 * source. A status that exists in the database but not in this list is a bug,
 * not a variant to tolerate.
 */

export const ARTICLE_STATUSES = [
  'draft',
  'submitted',
  'in-review',
  'changes-requested',
  'approved',
  'scheduled',
  'published',
  'unpublished',
  'archived',
] as const

export type ArticleStatus = (typeof ARTICLE_STATUSES)[number]

export const ARTICLE_TYPES = [
  'standard',
  'breaking-news',
  'opinion',
  'editorial',
  'feature',
  'interview',
  'analysis',
  'photo-story',
  'video-story',
  'live-blog',
] as const

export type ArticleType = (typeof ARTICLE_TYPES)[number]

/**
 * The word printed immediately before a headline for each article type.
 *
 * A rendering concern, kept beside the type vocabulary because two consumers
 * have to agree on it and they live in different packages. The site prints it;
 * the ingest's prompt has to *tell the model* it will be printed, because a
 * headline written without knowing comes back as "ছবিতে বাজারের ভিড়" and is
 * then published as "ছবিতে ছবিতে বাজারের ভিড়".
 *
 * `null` where a type carries no label: "News" above a news story tells a
 * reader nothing they had not already assumed, and `live-blog` announces itself
 * with a live indicator instead.
 */
export const TYPE_KICKERS: Record<ArticleType, { bn: string; en: string } | null> = {
  standard: null,
  'breaking-news': null,
  'live-blog': null,
  opinion: { bn: 'মতামত', en: 'Opinion' },
  editorial: { bn: 'সম্পাদকীয়', en: 'Editorial' },
  feature: { bn: 'ফিচার', en: 'Feature' },
  analysis: { bn: 'বিশ্লেষণ', en: 'Analysis' },
  interview: { bn: 'সাক্ষাৎকার', en: 'Interview' },
  'photo-story': { bn: 'ছবিতে', en: 'In pictures' },
  'video-story': { bn: 'ভিডিও', en: 'Video' },
}

/**
 * The only status the public site may ever serve.
 *
 * Kept as a single-element list rather than an inline string so that every
 * public query filters through the same constant — `unpublished` and `archived`
 * documents remain in the database and must never leak back into a listing.
 */
export const PUBLIC_STATUSES: readonly ArticleStatus[] = ['published']

/** Statuses an author may still freely edit without review. */
export const AUTHOR_EDITABLE_STATUSES: readonly ArticleStatus[] = ['draft', 'changes-requested']

/** Statuses that have never been publicly visible. */
export const PRE_PUBLICATION_STATUSES: readonly ArticleStatus[] = [
  'draft',
  'submitted',
  'in-review',
  'changes-requested',
  'approved',
  'scheduled',
]

export function isArticleStatus(value: unknown): value is ArticleStatus {
  return typeof value === 'string' && (ARTICLE_STATUSES as readonly string[]).includes(value)
}

export function isArticleType(value: unknown): value is ArticleType {
  return typeof value === 'string' && (ARTICLE_TYPES as readonly string[]).includes(value)
}

export function isPubliclyVisible(status: unknown): boolean {
  return isArticleStatus(status) && PUBLIC_STATUSES.includes(status)
}
