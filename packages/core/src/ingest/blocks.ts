/**
 * The block vocabulary an ingest generator may emit, and its serialisation to a
 * Lexical editor state.
 *
 * ## Why a block vocabulary rather than rich text
 *
 * A language model asked for "the article body" returns prose, and prose has to
 * be parsed back into structure by guesswork — a line that starts with a dash
 * might be a list item or a sentence about a dash. Asking instead for a typed
 * array of blocks moves that decision to the side of the boundary that actually
 * knows the answer, and makes the output validatable before anything is written:
 * an unknown block type is a rejected generation, not a paragraph containing the
 * word "pullQuote".
 *
 * ## Why serialisation lives here
 *
 * `body` is a `richText` field, so whatever the generator produces has to become
 * a Lexical state before Payload will store it — and `hasRichTextContent` in the
 * publish guards walks that state to decide whether the article has a body at
 * all. Both sides of that contract are in this package, framework-free and
 * unit-testable, rather than inside a job handler where they could only be
 * exercised by running the whole pipeline.
 */

/** Block kinds the generator may emit. Anything else is a rejected generation. */
export const INGEST_BLOCK_TYPES = [
  'paragraph',
  'subhead',
  'pullQuote',
  'list',
  'image',
  'divider',
] as const

export type IngestBlockType = (typeof INGEST_BLOCK_TYPES)[number]

export interface ParagraphBlock {
  type: 'paragraph'
  text: string
}

/** An in-body cross-head. Rendered as `h2`; the headline is the only `h1`. */
export interface SubheadBlock {
  type: 'subhead'
  text: string
}

export interface PullQuoteBlock {
  type: 'pullQuote'
  text: string
  /** Speaker or source. Optional because not every pulled line is attributable. */
  attribution?: string
}

export interface ListBlock {
  type: 'list'
  style: 'bullet' | 'number'
  items: string[]
}

/**
 * References a Media document that must already exist — the ingest uploads the
 * image and sets its alt text before the body is assembled, because an upload
 * node pointing at nothing renders as a gap that no publish guard catches.
 */
export interface ImageBlock {
  type: 'image'
  mediaId: string | number
  caption?: string
}

export interface DividerBlock {
  type: 'divider'
}

export type IngestBlock =
  ParagraphBlock | SubheadBlock | PullQuoteBlock | ListBlock | ImageBlock | DividerBlock

/* -------------------------------------------------------------------------- */
/*                                 Validation                                  */
/* -------------------------------------------------------------------------- */

export interface BlockIssue {
  /** Index in the generated array, so a rejection names the offending block. */
  index: number
  message: string
}

export type BlockValidation =
  { ok: true; blocks: IngestBlock[] } | { ok: false; issues: BlockIssue[] }

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Checks a generated block array before any of it reaches the database.
 *
 * Every problem is collected rather than thrown on first sight: a generation
 * with four malformed blocks should be logged once with all four, not retried
 * four times discovering them one at a time.
 */
export function validateBlocks(value: unknown): BlockValidation {
  if (!Array.isArray(value)) {
    return { ok: false, issues: [{ index: -1, message: 'Blocks must be an array' }] }
  }

  if (value.length === 0) {
    return { ok: false, issues: [{ index: -1, message: 'Blocks array is empty' }] }
  }

  const issues: BlockIssue[] = []
  const blocks: IngestBlock[] = []

  value.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      issues.push({ index, message: 'Block is not an object' })
      return
    }

    const candidate = raw as Record<string, unknown>
    const type = candidate.type

    if (typeof type !== 'string' || !(INGEST_BLOCK_TYPES as readonly string[]).includes(type)) {
      issues.push({ index, message: `Unknown block type: ${String(type)}` })
      return
    }

    switch (type as IngestBlockType) {
      case 'paragraph':
      case 'subhead': {
        if (!isNonEmptyString(candidate.text)) {
          issues.push({ index, message: `A ${type} block needs text` })
          return
        }
        blocks.push({ type, text: candidate.text.trim() } as ParagraphBlock | SubheadBlock)
        return
      }

      case 'pullQuote': {
        if (!isNonEmptyString(candidate.text)) {
          issues.push({ index, message: 'A pullQuote block needs text' })
          return
        }
        blocks.push({
          type: 'pullQuote',
          text: candidate.text.trim(),
          ...(isNonEmptyString(candidate.attribution)
            ? { attribution: candidate.attribution.trim() }
            : {}),
        })
        return
      }

      case 'list': {
        const style = candidate.style
        if (style !== 'bullet' && style !== 'number') {
          issues.push({ index, message: `A list block needs style "bullet" or "number"` })
          return
        }
        if (!Array.isArray(candidate.items) || candidate.items.length === 0) {
          issues.push({ index, message: 'A list block needs at least one item' })
          return
        }
        const items = candidate.items.filter(isNonEmptyString).map((item) => item.trim())
        if (items.length === 0) {
          issues.push({ index, message: 'Every item in the list block was empty' })
          return
        }
        blocks.push({ type: 'list', style, items })
        return
      }

      case 'image': {
        const mediaId = candidate.mediaId
        if (typeof mediaId !== 'string' && typeof mediaId !== 'number') {
          issues.push({ index, message: 'An image block needs a mediaId' })
          return
        }
        blocks.push({
          type: 'image',
          mediaId,
          ...(isNonEmptyString(candidate.caption) ? { caption: candidate.caption.trim() } : {}),
        })
        return
      }

      case 'divider': {
        blocks.push({ type: 'divider' })
        return
      }
    }
  })

  return issues.length === 0 ? { ok: true, blocks } : { ok: false, issues }
}

/** Formats block issues into one line for a log or an error message. */
export function describeBlockIssues(issues: readonly BlockIssue[]): string {
  return issues.map((issue) => `[${issue.index}] ${issue.message}`).join('; ')
}

/* -------------------------------------------------------------------------- */
/*                             Lexical serialisation                           */
/* -------------------------------------------------------------------------- */

/**
 * Lexical's serialised shape is positional and version-tagged: the editor reads
 * `version` to decide how to hydrate a node, and omitting the housekeeping
 * fields produces a state that stores cleanly and then fails to open in the
 * admin UI. They are spelled out rather than spread from a helper so that a
 * future Lexical upgrade shows up as a diff on the field it changed.
 *
 * `direction` is `ltr` for both locales — Bengali is a left-to-right script.
 */
const LTR = 'ltr'

interface LexicalTextNode {
  type: 'text'
  detail: 0
  format: number
  mode: 'normal'
  style: ''
  text: string
  version: 1
}

function textNode(text: string, format = 0): LexicalTextNode {
  return { type: 'text', detail: 0, format, mode: 'normal', style: '', text, version: 1 }
}

/** Bit 1 in Lexical's text format bitfield is bold. Used for quote attribution. */
const FORMAT_BOLD = 1

function elementNode(type: string, children: unknown[], extra: Record<string, unknown> = {}) {
  return {
    type,
    format: '',
    indent: 0,
    version: 1,
    direction: LTR,
    children,
    ...extra,
  }
}

function paragraph(text: string) {
  return elementNode('paragraph', [textNode(text)], { textFormat: 0, textStyle: '' })
}

function heading(text: string) {
  return elementNode('heading', [textNode(text)], { tag: 'h2' })
}

/**
 * A pull quote becomes a `quote` node, with the attribution as a bold run on its
 * own line inside the same block. Keeping the attribution inside the quote means
 * a reader copying the block gets the speaker with it, and the renderer does not
 * need a second node type to style the pair together.
 */
function pullQuote(block: PullQuoteBlock) {
  const children: unknown[] = [textNode(block.text)]
  if (block.attribution) {
    children.push(elementNode('linebreak', [], {}))
    children.push(textNode(block.attribution, FORMAT_BOLD))
  }
  return elementNode('quote', children)
}

function list(block: ListBlock) {
  const tag = block.style === 'number' ? 'ol' : 'ul'
  const listType = block.style === 'number' ? 'number' : 'bullet'

  const children = block.items.map((item, index) =>
    elementNode('listitem', [textNode(item)], { value: index + 1 }),
  )

  return elementNode('list', children, { listType, start: 1, tag })
}

/**
 * An upload node, which is how Lexical references a Media document inline.
 *
 * `version: 3` is the shape `@payloadcms/richtext-lexical` currently writes for
 * uploads; an older version tag makes the editor run a migration on open and
 * rewrite the field on the next save, which would show up as a phantom edit on
 * every ingested article an editor merely looked at.
 */
function image(block: ImageBlock) {
  return {
    type: 'upload',
    relationTo: 'media',
    value: block.mediaId,
    fields: block.caption ? { caption: block.caption } : {},
    format: '',
    version: 3,
  }
}

function divider() {
  return { type: 'horizontalrule', version: 1 }
}

/** The serialised Lexical state Payload stores in a `richText` field. */
export interface LexicalState {
  root: {
    type: 'root'
    format: ''
    indent: 0
    version: 1
    direction: typeof LTR
    children: unknown[]
  }
}

/**
 * Serialises validated blocks into a Lexical editor state.
 *
 * Takes `IngestBlock[]` rather than `unknown`, so callers have to run
 * `validateBlocks` first — the type is the reminder that unvalidated model
 * output must not reach this function.
 */
export function blocksToLexical(blocks: readonly IngestBlock[]): LexicalState {
  const children = blocks.map((block) => {
    switch (block.type) {
      case 'paragraph':
        return paragraph(block.text)
      case 'subhead':
        return heading(block.text)
      case 'pullQuote':
        return pullQuote(block)
      case 'list':
        return list(block)
      case 'image':
        return image(block)
      case 'divider':
        return divider()
    }
  })

  return {
    root: { type: 'root', format: '', indent: 0, version: 1, direction: LTR, children },
  }
}
