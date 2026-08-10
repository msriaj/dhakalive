export const MAX_SLUG_LENGTH = 180

/**
 * Zero-width characters are stripped from slugs even though ZWNJ (U+200C) and
 * ZWJ (U+200D) are meaningful for Bengali conjunct *rendering*. A slug is an
 * identifier, not display text: leaving them in produces two slugs that look
 * identical in a browser but resolve to different articles, which is both a
 * duplicate-content problem and an editor-confusion problem.
 *
 * Written as escapes rather than literals — these characters are invisible in
 * source and silently corrupt on copy/paste.
 */
// The rule guards against treating ZWJ as part of a grapheme by accident.
// Matching it as a standalone code point in order to delete it is the intent.
/* eslint-disable-next-line no-misleading-character-class */
const ZERO_WIDTH_RE = /[\u200B\u200C\u200D\uFEFF]/gu

/** Combining marks that carry no meaning once the base letter is gone. */
const LATIN_DIACRITIC_RE = /[\u0300-\u036F]/gu

/**
 * Characters kept in a slug: ASCII alphanumerics plus the Bengali block
 * (U+0980–U+09FF, which covers letters, vowel signs, and Bengali digits).
 * Everything else collapses to a separator.
 */
const DISALLOWED_RE = /[^a-z0-9\u0980-\u09FF]+/gu

const EDGE_HYPHENS_RE = /^-+|-+$/g
const REPEAT_HYPHENS_RE = /-{2,}/g

/**
 * Produces a URL-safe slug that preserves Bengali script.
 *
 * Bengali is kept as-is rather than transliterated: `bn` articles are expected
 * to carry Bengali slugs, and browsers percent-encode them transparently.
 */
export function slugify(input: string): string {
  if (typeof input !== 'string') return ''

  return (
    input
      // NFC first so a decomposed vowel sign is treated as one character, then
      // NFD only to peel Latin diacritics off their base letters.
      .normalize('NFC')
      .toLowerCase()
      .replace(ZERO_WIDTH_RE, '')
      .normalize('NFD')
      .replace(LATIN_DIACRITIC_RE, '')
      .normalize('NFC')
      .replace(DISALLOWED_RE, '-')
      .replace(REPEAT_HYPHENS_RE, '-')
      .replace(EDGE_HYPHENS_RE, '')
      .slice(0, MAX_SLUG_LENGTH)
      // Truncation can leave a trailing hyphen behind.
      .replace(EDGE_HYPHENS_RE, '')
  )
}

export function isValidSlug(value: string): boolean {
  if (!value || value.length > MAX_SLUG_LENGTH) return false
  return slugify(value) === value
}

/**
 * Appends `-2`, `-3`, … until the slug is free. `isTaken` is injected so this
 * stays a pure function — the database lookup lives at the call site.
 */
export function uniqueSlug(
  base: string,
  isTaken: (candidate: string) => boolean,
  maxAttempts = 100,
): string {
  const root = slugify(base)
  if (!root) throw new Error('Cannot derive a slug from the supplied value')
  if (!isTaken(root)) return root

  for (let suffix = 2; suffix <= maxAttempts; suffix += 1) {
    const tail = `-${suffix}`
    const trimmed = root.slice(0, MAX_SLUG_LENGTH - tail.length).replace(EDGE_HYPHENS_RE, '')
    const candidate = `${trimmed}${tail}`
    if (!isTaken(candidate)) return candidate
  }

  throw new Error(`Could not find a free slug for "${root}" after ${maxAttempts} attempts`)
}
