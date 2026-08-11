import { RichText as LexicalRichText } from '@payloadcms/richtext-lexical/react'
import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'

/**
 * Renders Lexical editor state.
 *
 * Payload's own renderer walks the node tree and emits elements — it never
 * interpolates HTML strings, so stored content cannot inject markup. Rich-text
 * sanitisation on the *write* path and an embed allowlist arrive in Phase 8;
 * this is the read side.
 */
/**
 * The class goes on Payload's own container, not on a wrapper around it.
 *
 * Payload emits `<div class="payload-richtext">` and the blocks are its
 * children. Wrapping that in a second div of our own put the paragraphs a level
 * deeper than every stylesheet expected: `.prose-article > * + *`, the drop cap,
 * the interview question rule and the callers' `space-y-*` utilities are all
 * child selectors, and all of them were matching the wrapper's only child rather
 * than the prose. The body rendered with no space between paragraphs at all.
 *
 * `className` replaces `payload-richtext` rather than adding to it — nothing
 * styles that class, so there is nothing to lose.
 */
export function RichText({ data, className }: { data: unknown; className?: string }) {
  if (!data || typeof data !== 'object') return null

  return <LexicalRichText className={className} data={data as SerializedEditorState} />
}
