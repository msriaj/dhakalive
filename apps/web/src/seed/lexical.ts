/**
 * Minimal Lexical editor-state builders.
 *
 * Rich text is stored as a serialised Lexical tree, and a hand-written literal
 * for every seeded article would be unreadable. These helpers emit the exact
 * node shape Payload's `lexicalEditor()` produces for plain paragraphs and
 * headings — enough for realistic bodies, and enough for `hasRichTextContent`
 * (the publish guard) to accept them as filled.
 */

/**
 * The index signatures are not decoration. Payload's generated rich-text type
 * models Lexical nodes as `{ type: any; version: number; [k: string]: unknown }`,
 * and a closed interface is not assignable to it.
 */
interface TextNode {
  type: 'text'
  detail: number
  format: number
  mode: 'normal'
  style: string
  text: string
  version: number
  [k: string]: unknown
}

/** Lexical's block alignment values, as Payload's generated types declare them. */
type ElementFormat = '' | 'left' | 'start' | 'center' | 'right' | 'end' | 'justify'

interface ElementNode {
  type: string
  tag?: string
  format: ElementFormat
  indent: number
  version: number
  direction: 'ltr'
  children: (ElementNode | TextNode)[]
  [k: string]: unknown
}

export interface LexicalState {
  root: ElementNode
  [k: string]: unknown
}

function text(value: string): TextNode {
  return { type: 'text', detail: 0, format: 0, mode: 'normal', style: '', text: value, version: 1 }
}

function element(type: string, children: string[], tag?: string): ElementNode {
  return {
    type,
    ...(tag ? { tag } : {}),
    format: '',
    indent: 0,
    version: 1,
    direction: 'ltr',
    children: children.map(text),
  }
}

/** A paragraph. */
export function p(value: string): ElementNode {
  return element('paragraph', [value])
}

/** A second-level heading, which is the deepest a story body should go. */
export function h2(value: string): ElementNode {
  return element('heading', [value], 'h2')
}

/** Wraps blocks into the root node Payload persists. */
export function richText(...blocks: ElementNode[]): LexicalState {
  return {
    root: {
      type: 'root',
      format: '',
      indent: 0,
      version: 1,
      direction: 'ltr',
      children: blocks,
    },
  }
}

/** The common case: a body of plain paragraphs. */
export function body(...paragraphs: string[]): LexicalState {
  return richText(...paragraphs.map(p))
}
