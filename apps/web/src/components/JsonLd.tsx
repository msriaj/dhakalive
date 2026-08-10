import type { JsonLdNode } from '@dhakalive/core'

/**
 * Emits a JSON-LD block.
 *
 * `dangerouslySetInnerHTML` is unavoidable here: React escapes text children as
 * HTML entities, and `&quot;` inside a `<script>` body is not valid JSON — the
 * block would be silently discarded by every consumer. So the escaping is done
 * explicitly instead.
 *
 * Two substitutions, and both matter:
 *
 * - `<` is escaped. Without it a document whose text contains
 *   `</script>` — a headline about HTML, a quoted code sample — terminates the
 *   script element early and injects the remainder into the page as markup.
 *   This is the whole attack surface of embedding data in a script tag.
 * - U+2028 and U+2029 are escaped. They are valid inside JSON but are line
 *   terminators in JavaScript, and some consumers parse this block with `eval`
 *   rather than a JSON parser.
 *
 * `JSON.stringify` handles everything else: quotes, backslashes and control
 * characters are already escaped by the time these run.
 */
function serialise(data: JsonLdNode): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

export function JsonLd({ data }: { data: JsonLdNode | null }) {
  if (!data) return null

  return (
    <script
      type="application/ld+json"
      // Safe by construction: serialised JSON with `<` escaped, never
      // author-supplied HTML. See the note above the serialiser.
      dangerouslySetInnerHTML={{ __html: serialise(data) }}
    />
  )
}
