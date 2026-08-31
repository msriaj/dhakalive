import { describe, expect, it, vi } from 'vitest'

import type { Homepage } from '../../payload-types'
import type { ArticleCardData } from './articles'

vi.mock('server-only', () => ({}))

/**
 * A tiny in-memory archive standing in for the articles queries.
 *
 * Every story belongs to category 2 and the ids run newest-first, which is the
 * shape of a young site where one section dominates: the newest stories in the
 * dominant category are also the newest stories on the site. That overlap is
 * exactly what starves a section when its over-fetch is computed too early.
 */
const ARCHIVE: ArticleCardData[] = Array.from({ length: 40 }, (_, index) => {
  const id = 40 - index
  return {
    id,
    title: `Story ${id}`,
    slug: `story-${id}`,
  } as unknown as ArticleCardData
})

function fromArchive(options: { limit: number; exclude?: number[] }) {
  const excluded = new Set(options.exclude ?? [])
  return Promise.resolve({
    docs: ARCHIVE.filter((article) => !excluded.has(article.id)).slice(0, options.limit),
  })
}

vi.mock('./articles', () => ({
  getLatestArticles: (options: { limit: number; exclude?: number[] }) => fromArchive(options),
  getArticlesByCategory: (_id: number | string, options: { limit: number; exclude?: number[] }) =>
    fromArchive(options),
  getArticlesByType: () => Promise.resolve({ docs: [] }),
  getMostViewedArticles: (options: { limit: number; exclude?: number[] }) => fromArchive(options),
}))

const CATEGORY = { id: 2, title: 'Bangladesh', slug: 'bangladesh' }

function homepageConfig(): Homepage {
  return {
    id: 1,
    leadStory: null,
    side: { source: 'latest', articles: [], category: null, articleTypes: [], limit: 5 },
    rail: { source: 'latest', articles: [], category: null, articleTypes: [], limit: 5 },
    subLeads: { source: 'latest', articles: [], category: null, articleTypes: [], limit: 3 },
    latestNews: { heading: null, limit: 8 },
    sections: [
      {
        id: 'section-bd',
        layout: 'story-cards',
        source: 'category',
        category: CATEGORY,
        showHeading: true,
        limit: 4,
        showAd: false,
        articleTypes: [],
        columns: [],
        articles: [],
        heading: 'Bangladesh',
      },
    ],
    editorsPicks: { heading: null, enabled: false, articles: [] },
    mediaSection: { heading: null, enabled: false, limit: 4 },
    trendingTags: { heading: null, enabled: false, tags: [] },
    updatedAt: '2026-08-31T00:00:00.000Z',
    createdAt: '2026-08-31T00:00:00.000Z',
  } as unknown as Homepage
}

describe('composeHomepage', () => {
  it('fills a category section even when the slots above claim the newest stories in it', async () => {
    const { composeHomepage } = await import('./home')

    const page = await composeHomepage(homepageConfig(), 'bn')

    // The blocks above the section take the newest stories.
    expect(page.lead).not.toBeNull()
    expect(page.side).toHaveLength(5)
    expect(page.rail).toHaveLength(5)
    expect(page.subLeads).toHaveLength(3)

    // The section still has 26 unclaimed stories in its category — it must
    // appear with its full complement, not be dropped for having fetched only
    // the handful the slots above already claimed.
    expect(page.sections).toHaveLength(1)
    expect(page.sections[0]?.articles).toHaveLength(4)
  })

  it('fills every queried slot to its limit when the archive is deep enough', async () => {
    const { composeHomepage } = await import('./home')

    const page = await composeHomepage(homepageConfig(), 'bn')

    const placedIds = [
      page.lead?.id,
      ...page.side.map((article) => article.id),
      ...page.rail.map((article) => article.id),
      ...page.subLeads.map((article) => article.id),
      ...page.sections.flatMap((section) => section.articles.map((article) => article.id)),
    ].filter((id): id is number => id !== undefined)

    // One story, one place: no block outside "latest" repeats another block.
    expect(new Set(placedIds).size).toBe(placedIds.length)
  })
})
