import type { Snippet } from './types.js'

/**
 * Match markers.
 *
 * Postgres `ts_headline` wraps matches in delimiters of our choosing. The
 * obvious choice is `<b>`/`</b>`, and it is the wrong one: the result would then
 * be an HTML string built partly from the reader's own query, which can only be
 * rendered with `dangerouslySetInnerHTML`. These two C0 control characters
 * cannot appear in editorial copy, survive the round trip through Postgres, and
 * are stripped from indexed text before storage so a document cannot forge them.
 */
export const HIGHLIGHT_START = '\u0002'
export const HIGHLIGHT_END = '\u0003'

/** Removes the markers from text on its way *into* the index. */
export function stripMarkers(value: string): string {
  return value.split(HIGHLIGHT_START).join('').split(HIGHLIGHT_END).join('')
}

/**
 * Splits marked-up headline text into runs.
 *
 * Tolerant of malformed input: an unopened or unclosed marker yields plain text
 * rather than throwing. A search page must render something even if the
 * database returns nonsense.
 */
export function parseSnippet(value: string | null | undefined): Snippet[] {
  if (!value) return []

  const snippets: Snippet[] = []
  let index = 0
  let matching = false
  let buffer = ''

  const flush = (): void => {
    if (buffer.length === 0) return
    const previous = snippets[snippets.length - 1]
    // Merge adjacent runs of the same kind so the renderer emits fewer nodes.
    if (previous?.match === matching) previous.text += buffer
    else snippets.push({ text: buffer, match: matching })
    buffer = ''
  }

  while (index < value.length) {
    const char = value[index] ?? ''

    if (char === HIGHLIGHT_START) {
      if (!matching) {
        flush()
        matching = true
      }
      index += 1
      continue
    }

    if (char === HIGHLIGHT_END) {
      if (matching) {
        flush()
        matching = false
      }
      index += 1
      continue
    }

    buffer += char
    index += 1
  }

  flush()
  return snippets
}

/** Plain text of a parsed snippet — for `aria-label`s and length checks. */
export function snippetText(snippets: readonly Snippet[]): string {
  return snippets.map((snippet) => snippet.text).join('')
}

/** Wraps unhighlighted text as a single run, for adapters with no headline support. */
export function plainSnippet(value: string | null | undefined): Snippet[] {
  if (!value) return []
  return [{ text: stripMarkers(value), match: false }]
}
