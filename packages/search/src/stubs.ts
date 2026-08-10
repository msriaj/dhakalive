import type { SearchProviderName } from '@dhakalive/config'

import type { SearchProvider } from './types.js'

/**
 * Placeholders for the two engines the abstraction exists to allow.
 *
 * They are deliberately not silent no-ops. A provider that quietly indexed
 * nothing would present as "search returns no results", which is indistinguishable
 * from an empty archive and would be diagnosed hours later. Every write and read
 * throws by name, so a misconfigured `SEARCH_PROVIDER` fails loudly on first use
 * — and `healthy()` returns false rather than throwing, so `/api/ready` reports
 * the problem instead of crashing on it.
 *
 * Implementing one is a single file: satisfy `SearchProvider` and register it in
 * `createSearchProvider`. Nothing else in the platform needs to change.
 */

export class SearchProviderNotImplementedError extends Error {
  public readonly provider: SearchProviderName

  constructor(provider: SearchProviderName) {
    super(
      `The "${provider}" search provider is not implemented yet. ` +
        `Set SEARCH_PROVIDER=postgres, or implement the adapter in @dhakalive/search.`,
    )
    this.name = 'SearchProviderNotImplementedError'
    this.provider = provider
  }
}

function unimplemented(name: SearchProviderName): SearchProvider {
  const fail = (): never => {
    throw new SearchProviderNotImplementedError(name)
  }

  return {
    name,
    index: () => Promise.resolve(fail()),
    remove: () => Promise.resolve(fail()),
    removeDocument: () => Promise.resolve(fail()),
    search: () => Promise.resolve(fail()),
    healthy: () => Promise.resolve(false),
  }
}

/**
 * Meilisearch.
 *
 * The reason to reach for it here is Bengali: Meilisearch tokenises Unicode and
 * does prefix matching by default, which is most of what the Postgres adapter
 * has to approximate with trigrams. An implementation needs `SEARCH_URL`, an
 * admin key for writes, a separate search-only key for reads, and one index per
 * locale so the ranking rules can differ.
 */
export function createMeilisearchProvider(): SearchProvider {
  return unimplemented('meilisearch')
}

/**
 * OpenSearch.
 *
 * Worth it only at a scale this platform is not at: aggregations, faceting
 * across millions of documents, and cross-cluster replication. It also needs an
 * ICU analysis plugin for usable Bengali tokenisation, which is a deployment
 * concern as much as a code one.
 */
export function createOpenSearchProvider(): SearchProvider {
  return unimplemented('opensearch')
}
