import 'server-only'

import { DEFAULT_SEARCH_LIMIT, MAX_QUERY_LENGTH, type SearchResults } from '@dhakalive/search'
import { getLogger } from '@dhakalive/observability'
import type { Locale } from '@dhakalive/config'

import { getPayloadClient } from '../queries/client'
import { getSearchProvider } from './provider'

/**
 * Public search, for the search page.
 *
 * `server-only`, unlike `./provider`: this is the read path and it is only ever
 * called from a server component, so the guard is worth having here even though
 * the provider module cannot carry it.
 *
 * Never throws. A search backend that is down should render an apology and a
 * working form, not a 500 — the rest of the site is fine, and a reader who
 * cannot search can still navigate.
 */

export const SEARCH_PAGE_SIZE = DEFAULT_SEARCH_LIMIT

export interface SearchPageResults extends SearchResults {
  /** Present when the backend failed, so the page can say so plainly. */
  failed: boolean
  page: number
  totalPages: number
}

export interface SearchPageRequest {
  query: string
  locale: Locale
  page?: number
  section?: string | null
}

export async function search(request: SearchPageRequest): Promise<SearchPageResults> {
  const page = Math.max(request.page ?? 1, 1)
  const query = request.query.trim().slice(0, MAX_QUERY_LENGTH)

  const empty: SearchPageResults = {
    hits: [],
    total: 0,
    strategy: 'empty',
    tookMs: 0,
    failed: false,
    page,
    totalPages: 0,
  }

  if (query.length === 0) return empty

  try {
    const payload = await getPayloadClient()
    const provider = getSearchProvider(payload)

    const results = await provider.search({
      query,
      locale: request.locale,
      limit: SEARCH_PAGE_SIZE,
      offset: (page - 1) * SEARCH_PAGE_SIZE,
      section: request.section ?? null,
    })

    return {
      ...results,
      failed: false,
      page,
      totalPages: Math.ceil(results.total / SEARCH_PAGE_SIZE),
    }
  } catch (error) {
    /**
     * The query itself is not logged. It is reader-supplied text on a page that
     * is `noindex` for good reason, and a search log is a record of what
     * individual readers were looking for — which for a news site can be
     * sensitive. The length is enough to tell a pathological query from a
     * backend outage.
     */
    getLogger().error(
      { err: error, locale: request.locale, queryLength: query.length },
      'Search failed',
    )
    return { ...empty, strategy: 'full-text', failed: true }
  }
}
