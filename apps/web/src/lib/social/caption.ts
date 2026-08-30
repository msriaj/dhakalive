/**
 * Caption text for a photocard post.
 *
 * The headline is on the card itself, so the caption carries the summary — the
 * paragraph for anyone deciding whether they care. Deliberately no article
 * link: the photocard is the publication, and a bare URL in the caption reads
 * as clutter on Instagram and Threads where it would not even be clickable.
 *
 * Facebook takes a title/description pair; Instagram and Threads take a single
 * caption. Both shapes are built here so the split lives in one place.
 */

export interface CaptionInput {
  headline: string
  summary?: string | null
}

export interface Caption {
  /** Facebook caption. */
  title: string
  /** Facebook extended text; ignored by the other platforms. */
  description: string
  /** Single-field caption for Instagram and Threads. */
  full: string
}

export function buildCaption(input: CaptionInput): Caption {
  const headline = input.headline.trim()
  const summary = input.summary?.trim() ?? ''
  return {
    title: headline,
    description: summary,
    full: [headline, summary].filter(Boolean).join('\n\n'),
  }
}
