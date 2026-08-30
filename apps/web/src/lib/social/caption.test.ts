import { describe, expect, it } from 'vitest'

import { buildCaption } from './caption'

describe('buildCaption', () => {
  it('splits headline and summary across the Facebook pair and joins them for the rest', () => {
    const caption = buildCaption({
      headline: 'ঢাকায় নতুন মেট্রো লাইন চালু',
      summary: 'উত্তরা থেকে মতিঝিল পর্যন্ত নতুন লাইন।',
    })

    expect(caption.title).toBe('ঢাকায় নতুন মেট্রো লাইন চালু')
    expect(caption.description).toBe('উত্তরা থেকে মতিঝিল পর্যন্ত নতুন লাইন।')
    expect(caption.full).toBe(
      'ঢাকায় নতুন মেট্রো লাইন চালু\n\nউত্তরা থেকে মতিঝিল পর্যন্ত নতুন লাইন।',
    )
  })

  it('never includes a link', () => {
    // The photocard is the publication; captions are text only by design.
    const caption = buildCaption({ headline: 'শিরোনাম', summary: 'সারাংশ' })
    expect(caption.full).not.toMatch(/https?:\/\//)
    expect(caption.description).not.toMatch(/https?:\/\//)
  })

  it('collapses to the headline alone when there is no summary', () => {
    for (const summary of [null, undefined, '', '   ']) {
      const caption = buildCaption({ headline: 'শিরোনাম', summary })
      expect(caption.full).toBe('শিরোনাম')
      expect(caption.description).toBe('')
    }
  })

  it('trims editor whitespace from the headline and summary', () => {
    const caption = buildCaption({ headline: '  শিরোনাম  ', summary: '  সারাংশ  ' })

    expect(caption.title).toBe('শিরোনাম')
    expect(caption.full).toBe('শিরোনাম\n\nসারাংশ')
  })
})
