/**
 * Caption text for a photocard post.
 *
 * The headline is on the card itself, so the caption's job is the parts a
 * flattened image loses: the summary for anyone deciding whether to tap, and
 * the link — the one thing that turns a Facebook impression into a reader.
 */

export interface CaptionInput {
  headline: string
  summary?: string | null
  /** Absolute article URL. */
  url: string
}

export interface Caption {
  title: string
  description: string
}

export function buildFacebookCaption(input: CaptionInput): Caption {
  const summary = input.summary?.trim()
  return {
    title: input.headline.trim(),
    description: [summary, input.url].filter(Boolean).join('\n\n'),
  }
}
