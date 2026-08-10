import { describe, expect, it } from 'vitest'
import { describeIssues, hasRichTextContent, validatePublishable } from './publish-guards.js'

function lexical(...texts: string[]) {
  return {
    root: {
      type: 'root',
      children: texts.map((text) => ({
        type: 'paragraph',
        children: [{ type: 'text', text }],
      })),
    },
  }
}

const EMPTY_LEXICAL = {
  root: { type: 'root', children: [{ type: 'paragraph', children: [] }] },
}

function validCandidate(overrides: Record<string, unknown> = {}) {
  return {
    headline: 'ঢাকায় মেট্রো রেলের নতুন লাইন চালু',
    slug: 'dhaka-metro-new-line',
    body: lexical('Full story text.'),
    authors: [1],
    primaryCategory: 3,
    language: 'bn',
    featuredImage: { id: 7, alt: 'Metro train at the platform' },
    ...overrides,
  }
}

describe('hasRichTextContent', () => {
  it('accepts a body with text', () => {
    expect(hasRichTextContent(lexical('Hello'))).toBe(true)
  })

  it('rejects an empty editor state, which is not null but has no text', () => {
    expect(hasRichTextContent(EMPTY_LEXICAL)).toBe(false)
  })

  it('rejects whitespace-only text', () => {
    expect(hasRichTextContent(lexical('   '))).toBe(false)
  })

  it('rejects null, undefined and non-objects', () => {
    expect(hasRichTextContent(null)).toBe(false)
    expect(hasRichTextContent(undefined)).toBe(false)
    expect(hasRichTextContent('some text')).toBe(false)
    expect(hasRichTextContent({})).toBe(false)
  })

  it('accepts a body whose only content is an upload', () => {
    const photoStory = {
      root: { type: 'root', children: [{ type: 'upload', value: { id: 1 } }] },
    }
    expect(hasRichTextContent(photoStory)).toBe(true)
  })

  it('finds text nested several levels deep', () => {
    const nested = {
      root: {
        type: 'root',
        children: [
          {
            type: 'list',
            children: [{ type: 'listitem', children: [{ type: 'text', text: 'x' }] }],
          },
        ],
      },
    }
    expect(hasRichTextContent(nested)).toBe(true)
  })
})

describe('validatePublishable', () => {
  it('accepts a complete article', () => {
    expect(validatePublishable(validCandidate())).toEqual({ ok: true })
  })

  it.each([
    ['headline', { headline: '' }],
    ['headline', { headline: '   ' }],
    ['slug', { slug: '' }],
    ['body', { body: EMPTY_LEXICAL }],
    ['authors', { authors: [] }],
    ['primaryCategory', { primaryCategory: null }],
    ['language', { language: '' }],
    ['featuredImage', { featuredImage: null }],
  ])('refuses publication when %s is missing', (field, override) => {
    const result = validatePublishable(validCandidate(override))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.map((issue) => issue.field)).toContain(field)
  })

  it('refuses a featured image without alt text', () => {
    const result = validatePublishable(validCandidate({ featuredImage: { id: 7, alt: '' } }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues[0]).toMatchObject({
        field: 'featuredImage',
        message: expect.stringContaining('alt text'),
      })
    }
  })

  it('reports every problem at once rather than stopping at the first', () => {
    const result = validatePublishable({})
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.field).sort()).toEqual([
        'authors',
        'body',
        'featuredImage',
        'headline',
        'language',
        'primaryCategory',
        'slug',
      ])
    }
  })

  it('skips the featured image requirement when the type does not need one', () => {
    const result = validatePublishable(validCandidate({ featuredImage: null }), {
      requireFeaturedImage: false,
    })
    expect(result).toEqual({ ok: true })
  })

  it('treats an empty relationship id as missing', () => {
    const result = validatePublishable(validCandidate({ featuredImage: { id: '', alt: 'x' } }))
    expect(result.ok).toBe(false)
  })
})

describe('describeIssues', () => {
  it('joins issues into one readable sentence', () => {
    const result = validatePublishable(validCandidate({ headline: '', authors: [] }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const description = describeIssues(result.issues)
      expect(description).toContain('headline:')
      expect(description).toContain('authors:')
      expect(description).toContain('; ')
    }
  })
})
