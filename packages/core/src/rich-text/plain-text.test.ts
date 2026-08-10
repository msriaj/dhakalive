import { describe, expect, it } from 'vitest'

import { richTextToPlainText } from './plain-text.js'

const text = (value: string) => ({ type: 'text', text: value, version: 1 })

const paragraph = (...values: string[]) => ({
  type: 'paragraph',
  version: 1,
  children: values.map(text),
})

const state = (...children: unknown[]) => ({ root: { type: 'root', version: 1, children } })

describe('richTextToPlainText', () => {
  it('returns an empty string for anything that is not an editor state', () => {
    expect(richTextToPlainText(null)).toBe('')
    expect(richTextToPlainText(undefined)).toBe('')
    expect(richTextToPlainText('a string')).toBe('')
    expect(richTextToPlainText({})).toBe('')
    expect(richTextToPlainText({ root: 'not an object' })).toBe('')
  })

  it('extracts text from a single paragraph', () => {
    expect(richTextToPlainText(state(paragraph('Budget session opens')))).toBe(
      'Budget session opens',
    )
  })

  it('keeps Bengali text intact', () => {
    expect(richTextToPlainText(state(paragraph('বাজেট অধিবেশন শুরু')))).toBe('বাজেট অধিবেশন শুরু')
  })

  it('separates blocks so adjacent words do not merge', () => {
    const result = richTextToPlainText(state(paragraph('first'), paragraph('second')))
    expect(result).toBe('first second')
    expect(result).not.toContain('firstsecond')
  })

  it('walks nested nodes', () => {
    const nested = state({
      type: 'list',
      version: 1,
      children: [
        { type: 'listitem', version: 1, children: [text('one')] },
        { type: 'listitem', version: 1, children: [text('two')] },
      ],
    })
    expect(richTextToPlainText(nested)).toBe('one two')
  })

  it('indexes an upload caption, because a reader may search for it', () => {
    const withUpload = state(paragraph('story'), {
      type: 'upload',
      version: 1,
      fields: { caption: 'Parliament at dusk' },
    })
    expect(richTextToPlainText(withUpload)).toBe('story Parliament at dusk')
  })

  it('walks a rich text caption on an upload node', () => {
    const withRichCaption = state({
      type: 'upload',
      version: 1,
      fields: {
        caption: { root: { type: 'root', version: 1, children: [paragraph('a caption')] } },
      },
    })
    expect(richTextToPlainText(withRichCaption)).toBe('a caption')
  })

  it('collapses whitespace', () => {
    expect(richTextToPlainText(state(paragraph('spaced    out\n\ntext')))).toBe('spaced out text')
  })

  it('truncates to maxLength', () => {
    const long = state(paragraph('abcdefghij'.repeat(10)))
    expect(richTextToPlainText(long, { maxLength: 20 })).toHaveLength(20)
  })

  it('stops walking once the limit is reached', () => {
    // The limit is a ceiling, not a target: the walk stops mid-document rather
    // than materialising a 500-paragraph body only to slice it. Collapsing
    // whitespace afterwards can leave the result a little under the cap.
    const long = state(...Array.from({ length: 500 }, (_entry, index) => paragraph(`para${index}`)))
    const result = richTextToPlainText(long, { maxLength: 30 })

    expect(result.length).toBeLessThanOrEqual(30)
    expect(result.startsWith('para0 para1')).toBe(true)
    expect(result).not.toContain('para100')
  })

  it('ignores nodes that carry no text', () => {
    expect(richTextToPlainText(state({ type: 'horizontalrule', version: 1 }))).toBe('')
  })
})
