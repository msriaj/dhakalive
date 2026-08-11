import { describe, expect, it } from 'vitest'

import { hasRichTextContent } from '../workflow/publish-guards.js'
import { richTextToPlainText } from '../rich-text/plain-text.js'
import {
  INGEST_BLOCK_TYPES,
  blocksToLexical,
  describeBlockIssues,
  validateBlocks,
  type IngestBlock,
} from './blocks.js'

const PARAGRAPH = { type: 'paragraph', text: 'পুলিশ ও নিহতের পরিবার জানায়।' }

describe('validateBlocks', () => {
  it('accepts every block type in the vocabulary', () => {
    const blocks = [
      PARAGRAPH,
      { type: 'subhead', text: 'তদন্ত কমিটি' },
      { type: 'pullQuote', text: 'তদন্তে প্রকৃত ঘটনা বেরিয়ে আসবে।', attribution: 'সেলিম মালিক' },
      { type: 'list', style: 'bullet', items: ['এক', 'দুই'] },
      { type: 'image', mediaId: 42, caption: 'ঘটনাস্থল' },
      { type: 'divider' },
    ]

    const result = validateBlocks(blocks)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.blocks.map((block) => block.type)).toEqual([...INGEST_BLOCK_TYPES])
  })

  it('rejects an unknown block type rather than coercing it', () => {
    const result = validateBlocks([{ type: 'tweet', text: 'hi' }])

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues[0]?.message).toContain('tweet')
  })

  it('reports every problem at once, each named by index', () => {
    const result = validateBlocks([
      PARAGRAPH,
      { type: 'subhead' },
      { type: 'list', style: 'roman' },
    ])

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.map((issue) => issue.index)).toEqual([1, 2])
    expect(describeBlockIssues(result.issues)).toContain('[1]')
  })

  it('rejects an empty array — a generation with no body is a failure, not a stub', () => {
    expect(validateBlocks([]).ok).toBe(false)
    expect(validateBlocks(null).ok).toBe(false)
  })

  it('drops empty list items but fails when nothing survives', () => {
    const kept = validateBlocks([{ type: 'list', style: 'number', items: ['এক', '  ', ''] }])
    expect(kept.ok).toBe(true)
    if (kept.ok) expect(kept.blocks[0]).toMatchObject({ items: ['এক'] })

    expect(validateBlocks([{ type: 'list', style: 'number', items: ['', ' '] }]).ok).toBe(false)
  })

  it('accepts a media id of either type, because Postgres ids are numbers and tests use strings', () => {
    expect(validateBlocks([{ type: 'image', mediaId: 7 }]).ok).toBe(true)
    expect(validateBlocks([{ type: 'image', mediaId: '7' }]).ok).toBe(true)
    expect(validateBlocks([{ type: 'image' }]).ok).toBe(false)
  })
})

describe('blocksToLexical', () => {
  const allBlocks: IngestBlock[] = [
    { type: 'paragraph', text: 'প্রথম অনুচ্ছেদ' },
    { type: 'subhead', text: 'উপশিরোনাম' },
    { type: 'pullQuote', text: 'উদ্ধৃতি', attribution: 'ওসি' },
    { type: 'list', style: 'number', items: ['এক', 'দুই'] },
    { type: 'image', mediaId: 42, caption: 'ছবির ক্যাপশন' },
    { type: 'divider' },
  ]

  /**
   * The load-bearing assertion. The publish guards decide whether an article has
   * a body by walking the Lexical state, so a serialiser that produced something
   * the guard reads as empty would make every ingested article unpublishable —
   * and would do it silently, since the write itself would succeed.
   */
  it('produces a state the publish guards accept as a real body', () => {
    expect(hasRichTextContent(blocksToLexical(allBlocks))).toBe(true)
  })

  it('produces a state the search indexer can flatten', () => {
    const text = richTextToPlainText(blocksToLexical(allBlocks))

    expect(text).toContain('প্রথম অনুচ্ছেদ')
    expect(text).toContain('উদ্ধৃতি')
    expect(text).toContain('দুই')
    // The caption is editorial text and readers search for it.
    expect(text).toContain('ছবির ক্যাপশন')
  })

  it('carries an image through as an upload node pointing at the media id', () => {
    const [node] = blocksToLexical([{ type: 'image', mediaId: 42 }]).root.children

    expect(node).toMatchObject({ type: 'upload', relationTo: 'media', value: 42 })
  })

  it('keeps the attribution inside the quote node', () => {
    const [node] = blocksToLexical([{ type: 'pullQuote', text: 'উদ্ধৃতি', attribution: 'ওসি' }])
      .root.children

    expect(richTextToPlainText({ root: { children: [node] } })).toContain('ওসি')
  })

  it('emits a divider that the guards count as content', () => {
    // A horizontal rule carries no text; the guard treats it as real content, so
    // a body of nothing but dividers would pass. That is the guard's rule, not
    // this serialiser's — asserted here so a change to it is visible.
    expect(hasRichTextContent(blocksToLexical([{ type: 'divider' }]))).toBe(true)
  })

  it('round-trips through validation without loss', () => {
    const validated = validateBlocks(allBlocks)
    expect(validated.ok).toBe(true)
    if (!validated.ok) return

    expect(blocksToLexical(validated.blocks).root.children).toHaveLength(allBlocks.length)
  })
})
