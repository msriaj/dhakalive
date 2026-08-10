import { describe, expect, it } from 'vitest'

import { parseRevalidationEvent } from './parse-event.js'
import { computeRevalidationTargets } from './revalidation-targets.js'

describe('parseRevalidationEvent', () => {
  it('rejects anything that is not an object', () => {
    expect(parseRevalidationEvent(null)).toBeNull()
    expect(parseRevalidationEvent('article')).toBeNull()
    expect(parseRevalidationEvent(42)).toBeNull()
    expect(parseRevalidationEvent([])).toBeNull()
  })

  it('rejects an unknown locale', () => {
    expect(parseRevalidationEvent({ type: 'global', locale: 'fr', global: 'homepage' })).toBeNull()
    expect(parseRevalidationEvent({ type: 'global', global: 'homepage' })).toBeNull()
  })

  it('rejects an unknown event type', () => {
    expect(parseRevalidationEvent({ type: 'everything', locale: 'bn' })).toBeNull()
  })

  it('accepts a global event', () => {
    expect(parseRevalidationEvent({ type: 'global', locale: 'bn', global: 'header' })).toEqual({
      type: 'global',
      locale: 'bn',
      global: 'header',
    })
  })

  it('rejects a global name that is not one of ours', () => {
    expect(parseRevalidationEvent({ type: 'global', locale: 'bn', global: 'secrets' })).toBeNull()
  })

  it('accepts an article change and defaults its visibility flags to false', () => {
    const parsed = parseRevalidationEvent({
      type: 'article',
      locale: 'en',
      article: { id: 12, slug: 'a-story' },
      categorySlug: 'politics',
    })

    expect(parsed).toMatchObject({
      type: 'article',
      locale: 'en',
      article: { id: 12, slug: 'a-story', previousSlug: null },
      categorySlug: 'politics',
      wasPublic: false,
      isPublic: false,
    })
  })

  it('requires an article reference with an id', () => {
    expect(parseRevalidationEvent({ type: 'article', locale: 'en' })).toBeNull()
    expect(parseRevalidationEvent({ type: 'article', locale: 'en', article: {} })).toBeNull()
    expect(
      parseRevalidationEvent({ type: 'article', locale: 'en', article: { id: '' } }),
    ).toBeNull()
  })

  it('keeps Bengali slugs intact', () => {
    const parsed = parseRevalidationEvent({
      type: 'article',
      locale: 'bn',
      article: { id: 4, slug: 'মেট্রোরেল-সম্প্রসারণ' },
      categorySlug: 'bangladesh',
      isPublic: true,
      wasPublic: true,
    })

    expect(parsed).toMatchObject({ article: { slug: 'মেট্রোরেল-সম্প্রসারণ' } })
  })

  /**
   * The security property of the endpoint: a caller describes a change, never a
   * purge set. Anything path-shaped in the body has to be ignored, not honoured.
   */
  it('ignores caller-supplied paths and tags', () => {
    const parsed = parseRevalidationEvent({
      type: 'global',
      locale: 'bn',
      global: 'homepage',
      paths: ['/bn/anything', '/'],
      tags: ['everything'],
    })

    expect(parsed).toEqual({ type: 'global', locale: 'bn', global: 'homepage' })

    const targets = computeRevalidationTargets(parsed!)
    expect(targets.paths).not.toContain('/bn/anything')
  })

  it('caps list lengths so one event cannot expand without bound', () => {
    const parsed = parseRevalidationEvent({
      type: 'article',
      locale: 'bn',
      article: { id: 1 },
      tagIds: Array.from({ length: 500 }, (_entry, index) => index + 1),
      authorSlugs: Array.from({ length: 500 }, (_entry, index) => `author-${index}`),
    })

    expect(parsed).toMatchObject({ type: 'article' })
    if (parsed?.type !== 'article') throw new Error('expected an article change')
    expect(parsed.tagIds).toHaveLength(100)
    expect(parsed.authorSlugs).toHaveLength(100)
  })

  it('drops malformed entries from lists rather than failing the whole event', () => {
    const parsed = parseRevalidationEvent({
      type: 'article',
      locale: 'bn',
      article: { id: 1 },
      tagIds: [1, null, 'two', {}, 3],
    })

    if (parsed?.type !== 'article') throw new Error('expected an article change')
    expect(parsed.tagIds).toEqual([1, 'two', 3])
  })

  it('accepts every entity event shape', () => {
    for (const type of ['category', 'tag', 'author', 'page'] as const) {
      const parsed = parseRevalidationEvent({ type, locale: 'bn', [type]: { id: 7, slug: 's' } })
      expect(parsed).toMatchObject({ type, locale: 'bn' })
    }

    for (const type of ['live-blog', 'live-blog-update'] as const) {
      const parsed = parseRevalidationEvent({ type, locale: 'bn', liveBlog: { id: 7 } })
      expect(parsed).toMatchObject({ type, locale: 'bn', liveBlog: { id: 7 } })
    }
  })

  it('round-trips through JSON, which is how it actually arrives', () => {
    const event = {
      type: 'article' as const,
      locale: 'bn' as const,
      article: { id: 3, slug: 'x', previousSlug: 'y' },
      categorySlug: 'politics',
      wasPublic: true,
      isPublic: true,
      publishedAt: '2026-08-10T00:00:00.000Z',
    }

    const parsed = parseRevalidationEvent(JSON.parse(JSON.stringify(event)))
    expect(parsed).toMatchObject(event)
  })
})
