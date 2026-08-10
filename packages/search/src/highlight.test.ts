import { describe, expect, it } from 'vitest'

import {
  HIGHLIGHT_END,
  HIGHLIGHT_START,
  parseSnippet,
  plainSnippet,
  snippetText,
  stripMarkers,
} from './highlight.js'

const mark = (value: string): string => `${HIGHLIGHT_START}${value}${HIGHLIGHT_END}`

describe('parseSnippet', () => {
  it('returns nothing for empty input', () => {
    expect(parseSnippet(null)).toEqual([])
    expect(parseSnippet(undefined)).toEqual([])
    expect(parseSnippet('')).toEqual([])
  })

  it('treats unmarked text as a single unmatched run', () => {
    expect(parseSnippet('Budget session opens')).toEqual([
      { text: 'Budget session opens', match: false },
    ])
  })

  it('splits a marked term out of surrounding text', () => {
    expect(parseSnippet(`${mark('Budget')} session opens`)).toEqual([
      { text: 'Budget', match: true },
      { text: ' session opens', match: false },
    ])
  })

  it('handles several marked terms', () => {
    expect(parseSnippet(`a ${mark('b')} c ${mark('d')}`)).toEqual([
      { text: 'a ', match: false },
      { text: 'b', match: true },
      { text: ' c ', match: false },
      { text: 'd', match: true },
    ])
  })

  it('preserves Bengali text and marks within it', () => {
    const parsed = parseSnippet(`${mark('বাজেট')} অধিবেশন শুরু`)
    expect(parsed).toEqual([
      { text: 'বাজেট', match: true },
      { text: ' অধিবেশন শুরু', match: false },
    ])
    expect(snippetText(parsed)).toBe('বাজেট অধিবেশন শুরু')
  })

  it('merges adjacent runs of the same kind', () => {
    // Two marked terms with nothing between them must not become two nodes.
    expect(parseSnippet(`${mark('a')}${mark('b')}`)).toEqual([{ text: 'ab', match: true }])
  })

  // Malformed input has to render as something. A search page that throws
  // because the database returned an unbalanced marker is worse than one that
  // shows the text unhighlighted.
  it('tolerates an unclosed marker', () => {
    expect(parseSnippet(`${HIGHLIGHT_START}Budget session`)).toEqual([
      { text: 'Budget session', match: true },
    ])
  })

  it('tolerates a stray closing marker', () => {
    expect(parseSnippet(`Budget${HIGHLIGHT_END} session`)).toEqual([
      { text: 'Budget session', match: false },
    ])
  })

  it('ignores a repeated opening marker', () => {
    expect(parseSnippet(`${HIGHLIGHT_START}${HIGHLIGHT_START}x${HIGHLIGHT_END}`)).toEqual([
      { text: 'x', match: true },
    ])
  })
})

describe('stripMarkers', () => {
  it('removes markers so an indexed document cannot forge a highlight', () => {
    expect(stripMarkers(`${HIGHLIGHT_START}fake${HIGHLIGHT_END} headline`)).toBe('fake headline')
  })

  it('leaves ordinary text untouched', () => {
    expect(stripMarkers('বাজেট অধিবেশন')).toBe('বাজেট অধিবেশন')
  })
})

describe('plainSnippet', () => {
  it('wraps text as one unmatched run', () => {
    expect(plainSnippet('hello')).toEqual([{ text: 'hello', match: false }])
  })

  it('strips markers from the text it wraps', () => {
    expect(plainSnippet(`${HIGHLIGHT_START}hello`)).toEqual([{ text: 'hello', match: false }])
  })

  it('returns nothing for empty input', () => {
    expect(plainSnippet(null)).toEqual([])
  })
})
