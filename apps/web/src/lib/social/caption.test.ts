import { describe, expect, it } from 'vitest'

import { buildCaption } from './caption'

describe('buildCaption', () => {
  it('joins headline and summary with a blank line', () => {
    const caption = buildCaption({
      headline: 'ঢাকায় নতুন মেট্রো লাইন চালু',
      summary: 'উত্তরা থেকে মতিঝিল পর্যন্ত নতুন লাইন।',
    })

    expect(caption).toBe('ঢাকায় নতুন মেট্রো লাইন চালু\n\nউত্তরা থেকে মতিঝিল পর্যন্ত নতুন লাইন।')
  })

  it('never includes a link', () => {
    // The photocard is the publication; captions are text only by design.
    const caption = buildCaption({ headline: 'শিরোনাম', summary: 'সারাংশ' })
    expect(caption).not.toMatch(/https?:\/\//)
  })

  it('collapses to the headline alone when there is no summary', () => {
    for (const summary of [null, undefined, '', '   ']) {
      expect(buildCaption({ headline: 'শিরোনাম', summary })).toBe('শিরোনাম')
    }
  })

  it('trims editor whitespace from the headline and summary', () => {
    const caption = buildCaption({ headline: '  শিরোনাম  ', summary: '  সারাংশ  ' })
    expect(caption).toBe('শিরোনাম\n\nসারাংশ')
  })
})
