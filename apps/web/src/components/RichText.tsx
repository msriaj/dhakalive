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
export function RichText({ data, className }: { data: unknown; className?: string }) {
  if (!data || typeof data !== 'object') return null

  return (
    <div className={className}>
      <LexicalRichText data={data as SerializedEditorState} />
    </div>
  )
}
