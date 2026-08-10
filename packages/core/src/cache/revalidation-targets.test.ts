import { describe, expect, it } from 'vitest'

import {
  allLocaleHomes,
  computeRevalidationTargets,
  mergeTargets,
  type ArticleChange,
} from './revalidation-targets.js'
import { CacheTag } from './tags.js'

function articleEvent(overrides: Partial<ArticleChange> = {}): ArticleChange {
  return {
    type: 'article',
    locale: 'bn',
    article: { id: 42, slug: 'dhaka-metro' },
    categorySlug: 'politics',
    categoryId: 7,
    tagIds: [1, 2],
    authorIds: [5],
    authorSlugs: ['rafiq-ahmed'],
    publishedAt: '2026-08-10T04:00:00.000Z',
    wasPublic: false,
    isPublic: true,
    ...overrides,
  }
}

describe('article changes', () => {
  it('invalidates nothing while a draft stays a draft', () => {
    // Autosave fires constantly; purging on every keystroke would keep the edge
    // cache permanently empty.
    const targets = computeRevalidationTargets(articleEvent({ wasPublic: false, isPublic: false }))
    expect(targets).toEqual({ tags: [], paths: [] })
  })

  it('invalidates the article, its section, the home page and the feeds on publish', () => {
    const targets = computeRevalidationTargets(articleEvent())

    expect(targets.paths).toContain('/bn/politics/dhaka-metro')
    expect(targets.paths).toContain('/bn/politics')
    expect(targets.paths).toContain('/bn')
    expect(targets.tags).toContain(CacheTag.article('bn', 42))
    expect(targets.tags).toContain(CacheTag.articleFeed('bn'))
    expect(targets.tags).toContain(CacheTag.home('bn'))
    expect(targets.tags).toContain(CacheTag.sitemap())
  })

  it('still invalidates when an article is unpublished', () => {
    // The story is gone, but the pages that listed it are now wrong.
    const targets = computeRevalidationTargets(articleEvent({ wasPublic: true, isPublic: false }))
    expect(targets.paths).toContain('/bn/politics/dhaka-metro')
    expect(targets.tags).toContain(CacheTag.articleFeed('bn'))
  })

  it('purges the previous URL when the slug changes', () => {
    const targets = computeRevalidationTargets(
      articleEvent({
        article: { id: 42, slug: 'dhaka-metro-line-6', previousSlug: 'dhaka-metro' },
        wasPublic: true,
        isPublic: true,
      }),
    )
    expect(targets.paths).toContain('/bn/politics/dhaka-metro-line-6')
    expect(targets.paths).toContain('/bn/politics/dhaka-metro')
  })

  it('purges both sections when an article moves between them', () => {
    const targets = computeRevalidationTargets(
      articleEvent({ categorySlug: 'business', previousCategorySlug: 'politics' }),
    )
    expect(targets.paths).toContain('/bn/business/dhaka-metro')
    expect(targets.paths).toContain('/bn/politics/dhaka-metro')
    expect(targets.paths).toContain('/bn/business')
    expect(targets.paths).toContain('/bn/politics')
  })

  it('invalidates every author and tag the story touches', () => {
    const targets = computeRevalidationTargets(articleEvent())
    expect(targets.tags).toContain(CacheTag.tag('bn', 1))
    expect(targets.tags).toContain(CacheTag.tag('bn', 2))
    expect(targets.tags).toContain(CacheTag.author('bn', 5))
    expect(targets.paths).toContain('/bn/author/rafiq-ahmed')
  })

  it('invalidates the archive day, in the newsroom timezone', () => {
    // 2026-08-10T04:00Z is 10:00 on 10 August in Dhaka (UTC+6).
    const targets = computeRevalidationTargets(articleEvent())
    expect(targets.paths).toContain('/bn/archive/2026/08/10')
  })

  it('rolls the archive day forward for late-evening UTC timestamps', () => {
    // 21:00Z on 9 August is 03:00 on 10 August in Dhaka.
    const targets = computeRevalidationTargets(
      articleEvent({ publishedAt: '2026-08-09T21:00:00.000Z' }),
    )
    expect(targets.paths).toContain('/bn/archive/2026/08/10')
  })

  it('ignores an unparseable publication date instead of throwing', () => {
    const targets = computeRevalidationTargets(articleEvent({ publishedAt: 'not-a-date' }))
    expect(targets.paths.some((path) => path.includes('/archive/'))).toBe(false)
  })

  it('percent-encodes Bengali slugs so purge URLs are valid', () => {
    const targets = computeRevalidationTargets(
      articleEvent({ article: { id: 9, slug: 'ঢাকা-মেট্রো' }, categorySlug: 'রাজনীতি' }),
    )
    const articlePath = targets.paths.find((path) => path.includes('%'))
    expect(articlePath).toBeDefined()
    expect(articlePath).not.toMatch(/[^\x20-\x7E]/)
  })

  it('never emits duplicates', () => {
    const targets = computeRevalidationTargets(
      articleEvent({ article: { id: 42, slug: 'dhaka-metro', previousSlug: 'dhaka-metro' } }),
    )
    expect(new Set(targets.paths).size).toBe(targets.paths.length)
    expect(new Set(targets.tags).size).toBe(targets.tags.length)
  })

  it('keeps locales separate', () => {
    const targets = computeRevalidationTargets(articleEvent({ locale: 'en' }))
    expect(targets.paths.every((path) => path.startsWith('/en'))).toBe(true)
    expect(targets.tags).toContain(CacheTag.home('en'))
    expect(targets.tags).not.toContain(CacheTag.home('bn'))
  })
})

describe('taxonomy changes', () => {
  it('treats a category change as a navigation change', () => {
    const targets = computeRevalidationTargets({
      type: 'category',
      locale: 'bn',
      category: { id: 7, slug: 'politics' },
    })
    expect(targets.tags).toContain(CacheTag.layout('bn'))
    expect(targets.paths).toContain('/bn/politics')
    expect(targets.paths).toContain('/bn')
  })

  it('purges an old category URL after a rename', () => {
    const targets = computeRevalidationTargets({
      type: 'category',
      locale: 'bn',
      category: { id: 7, slug: 'business', previousSlug: 'economy' },
    })
    expect(targets.paths).toContain('/bn/business')
    expect(targets.paths).toContain('/bn/economy')
  })

  it('keeps tag and author changes narrow', () => {
    const tagTargets = computeRevalidationTargets({
      type: 'tag',
      locale: 'bn',
      tag: { id: 3, slug: 'budget' },
    })
    expect(tagTargets.paths).toEqual(['/bn/tag/budget'])
    // A tag rename must not invalidate the whole site.
    expect(tagTargets.tags).not.toContain(CacheTag.layout('bn'))

    const authorTargets = computeRevalidationTargets({
      type: 'author',
      locale: 'bn',
      author: { id: 5, slug: 'rafiq-ahmed' },
    })
    expect(authorTargets.paths).toEqual(['/bn/author/rafiq-ahmed'])
  })
})

describe('live blogs', () => {
  it('invalidates only the live blog when an entry is posted', () => {
    const targets = computeRevalidationTargets({
      type: 'live-blog-update',
      locale: 'bn',
      liveBlog: { id: 11, slug: 'election-night' },
    })
    expect(targets.paths).toEqual(['/bn/live/election-night'])
    // Entries are posted constantly; touching the sitemap each time is waste.
    expect(targets.tags).not.toContain(CacheTag.sitemap())
  })

  it('includes the sitemap when the live blog itself changes', () => {
    const targets = computeRevalidationTargets({
      type: 'live-blog',
      locale: 'bn',
      liveBlog: { id: 11, slug: 'election-night' },
    })
    expect(targets.tags).toContain(CacheTag.sitemap())
  })
})

describe('globals', () => {
  it('scopes a homepage change to the home page', () => {
    const targets = computeRevalidationTargets({
      type: 'global',
      locale: 'bn',
      global: 'homepage',
    })
    expect(targets.paths).toEqual(['/bn'])
    expect(targets.tags).toEqual([CacheTag.home('bn')])
  })

  it.each(['header', 'footer', 'site-settings', 'seo-defaults'] as const)(
    'invalidates the shared layout for %s by tag, not by URL enumeration',
    (global) => {
      const targets = computeRevalidationTargets({ type: 'global', locale: 'bn', global })
      expect(targets.tags).toContain(CacheTag.layout('bn'))
      // The affected URL set is the whole site; enumerating it is not possible.
      expect(targets.paths).toEqual(['/bn'])
    },
  )
})

describe('mergeTargets', () => {
  it('combines and de-duplicates', () => {
    const merged = mergeTargets(
      computeRevalidationTargets(articleEvent()),
      computeRevalidationTargets(articleEvent()),
    )
    expect(new Set(merged.paths).size).toBe(merged.paths.length)
    expect(merged.paths).toContain('/bn/politics/dhaka-metro')
  })
})

describe('allLocaleHomes', () => {
  it('covers every configured locale', () => {
    const targets = allLocaleHomes()
    expect(targets.paths).toContain('/bn')
    expect(targets.paths).toContain('/en')
  })
})
