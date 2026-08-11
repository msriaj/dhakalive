import { RichText as LexicalRichText } from '@payloadcms/richtext-lexical/react'
import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'
import type { JSXConvertersFunction } from '@payloadcms/richtext-lexical/react'

import { MediaImage } from './MediaImage'

/**
 * Pictures inside a story body.
 *
 * Payload's own upload converter emits a bare `<img>` with the asset's intrinsic
 * width and height: unoptimised, unsized for the viewport, and with no caption —
 * it reads `fields.alt` and ignores everything else, so the caption an editor
 * typed and the one the ingest carries over from the source were both dropped on
 * the floor. A photograph in the middle of a report is usually the only evidence
 * the reader gets, and an uncredited, uncaptioned one is worth less than it
 * should be.
 */
const converters: JSXConvertersFunction = ({ defaultConverters }) => ({
  ...defaultConverters,
  upload: ({ node }) => {
    const value: unknown = node.value
    if (!value || typeof value !== 'object') return null

    const fields = node.fields as { caption?: unknown } | undefined
    const caption = typeof fields?.caption === 'string' ? fields.caption.trim() : ''

    return (
      <figure>
        {/*
          The measure is capped by the prose column, so the hint is the column
          and not the viewport — asking for 100vw on a desktop downloads an
          image twice the width it is painted at.
        */}
        <MediaImage
          media={value}
          sizes="(min-width: 768px) 720px, 100vw"
          className="h-auto w-full rounded-md"
        />
        {caption.length > 0 ? <figcaption>{caption}</figcaption> : null}
      </figure>
    )
  },
})

/**
 * Renders Lexical editor state.
 *
 * Payload's own renderer walks the node tree and emits elements — it never
 * interpolates HTML strings, so stored content cannot inject markup. Rich-text
 * sanitisation on the *write* path and an embed allowlist arrive in Phase 8;
 * this is the read side.
 *
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

  return (
    <LexicalRichText
      className={className}
      converters={converters}
      data={data as SerializedEditorState}
    />
  )
}
