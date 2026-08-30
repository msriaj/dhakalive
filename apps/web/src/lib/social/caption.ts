/**
 * Caption text for a photocard post.
 *
 * One caption, identical on every platform: the headline, then the summary.
 * Deliberately no article link — the photocard is the publication, and a bare
 * URL reads as clutter on Instagram and Threads where it is not clickable.
 *
 * There used to be a Facebook title/description split here, matching how the
 * Upload-Post API documents its fields. The live behaviour did not match the
 * documentation: Facebook buried `description` in the photo's invisible legacy
 * description field (feed showed the headline alone) and Instagram preferred
 * `description` over its own platform title (feed showed the summary alone).
 * Only Threads came out right. Sending a single `title` and nothing else is
 * what makes all three render the same text.
 */

export interface CaptionInput {
  headline: string
  summary?: string | null
}

export function buildCaption(input: CaptionInput): string {
  const headline = input.headline.trim()
  const summary = input.summary?.trim() ?? ''
  return [headline, summary].filter(Boolean).join('\n\n')
}
