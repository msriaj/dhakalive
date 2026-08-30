import { describe, expect, it } from 'vitest'

import { buildFacebookCaption } from './caption'

const URL_BN =
  'https://dhakalive.com.bd/%E0%A6%B0%E0%A6%BE%E0%A6%9C%E0%A6%A8%E0%A7%80%E0%A6%A4%E0%A6%BF/some-story'

describe('buildFacebookCaption', () => {
  it('uses the headline as the caption and puts summary and link in the description', () => {
    const caption = buildFacebookCaption({
      headline: 'ঢাকায় নতুন মেট্রো লাইন চালু',
      summary: 'উত্তরা থেকে মতিঝিল পর্যন্ত নতুন লাইন।',
      url: URL_BN,
    })

    expect(caption.title).toBe('ঢাকায় নতুন মেট্রো লাইন চালু')
    expect(caption.description).toBe(`উত্তরা থেকে মতিঝিল পর্যন্ত নতুন লাইন।\n\n${URL_BN}`)
  })

  it('still carries the link when there is no summary', () => {
    // The link is the caption's whole job — an absent summary must not take it
    // down with it, and must not leave blank lines above it either.
    for (const summary of [null, undefined, '', '   ']) {
      const caption = buildFacebookCaption({ headline: 'শিরোনাম', summary, url: URL_BN })
      expect(caption.description).toBe(URL_BN)
    }
  })

  it('trims editor whitespace from the headline and summary', () => {
    const caption = buildFacebookCaption({
      headline: '  শিরোনাম  ',
      summary: '  সারাংশ  ',
      url: URL_BN,
    })

    expect(caption.title).toBe('শিরোনাম')
    expect(caption.description).toBe(`সারাংশ\n\n${URL_BN}`)
  })
})
