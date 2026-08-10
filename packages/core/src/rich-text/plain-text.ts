/**
 * Flattens a Lexical editor state to plain text.
 *
 * Written for the search indexer, where storing markup would be actively
 * harmful: `to_tsvector` would index `href`, `class` and node type names as
 * though they were editorial content, and a highlighted snippet drawn from that
 * text would leak fragments of markup into the results page.
 *
 * Pure and framework-free, like everything else in this package — it walks the
 * serialised node tree by shape and knows nothing about the editor that produced
 * it.
 */

/** Node types that separate blocks rather than continuing a sentence. */
const BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'quote',
  'listitem',
  'list',
  'horizontalrule',
  'table',
  'tablerow',
  'tablecell',
])

interface UnknownNode {
  type?: unknown
  text?: unknown
  children?: unknown
  /** Upload and relationship nodes carry their payload here. */
  fields?: unknown
  value?: unknown
}

export interface PlainTextOptions {
  /**
   * Stop after this many characters. The indexer caps body text because a
   * 40,000-word liveblog transcript adds nothing to relevance and a great deal
   * to index size.
   */
  maxLength?: number
}

/**
 * Extracts readable text.
 *
 * Returns an empty string for anything that is not a Lexical state, so callers
 * do not have to distinguish "no body" from "malformed body" — for indexing
 * purposes they are the same.
 */
export function richTextToPlainText(value: unknown, options: PlainTextOptions = {}): string {
  const { maxLength } = options

  if (!value || typeof value !== 'object') return ''
  const root = (value as { root?: unknown }).root
  if (!root || typeof root !== 'object') return ''

  const parts: string[] = []
  let length = 0
  let truncated = false

  const push = (text: string): void => {
    if (truncated || text.length === 0) return
    parts.push(text)
    length += text.length
    if (maxLength !== undefined && length >= maxLength) truncated = true
  }

  const visit = (node: unknown): void => {
    if (truncated || !node || typeof node !== 'object') return
    const candidate = node as UnknownNode

    if (typeof candidate.text === 'string') push(candidate.text)

    /**
     * A nested editor state — a caption written in rich text, for instance —
     * arrives wrapped in its own `root`. Unwrapping it here means the walk does
     * not have to know at which depths that can happen.
     */
    const nestedRoot = (candidate as { root?: unknown }).root
    if (nestedRoot && typeof nestedRoot === 'object') visit(nestedRoot)

    if (Array.isArray(candidate.children)) {
      for (const child of candidate.children) visit(child)
    }

    /**
     * Upload nodes carry the caption an editor wrote for an image. That caption
     * is real editorial text and readers search for it, so it is indexed — but
     * the image's filename and alt text are not, because matching a story on the
     * name of a JPEG produces results nobody can explain.
     */
    if (candidate.fields && typeof candidate.fields === 'object') {
      const caption = (candidate.fields as { caption?: unknown }).caption
      if (typeof caption === 'string') push(caption)
      else if (caption && typeof caption === 'object') visit(caption)
    }

    // Block-level nodes end with a separator so words either side of a paragraph
    // break do not run together into one nonexistent token.
    if (typeof candidate.type === 'string' && BLOCK_TYPES.has(candidate.type)) push('\n')
  }

  visit(root)

  const text = normaliseWhitespace(parts.join(' '))
  return maxLength === undefined ? text : text.slice(0, maxLength)
}

/**
 * Collapses runs of whitespace. Lexical emits a lot of it once nodes are joined,
 * and it is pure index weight — Postgres tokenises identically either way.
 */
function normaliseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}
