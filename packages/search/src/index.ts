import type { SearchProviderName } from '@dhakalive/config'

import { createPostgresSearchProvider, type PostgresSearchOptions } from './postgres/index.js'
import { createMeilisearchProvider, createOpenSearchProvider } from './stubs.js'
import type { SearchProvider } from './types.js'

/**
 * `@dhakalive/search` — the search abstraction and its adapters.
 *
 * Like `@dhakalive/core`, this package imports neither Payload nor Next. The
 * Postgres adapter is handed a SQL executor; a future HTTP adapter would be
 * handed a fetch client. That is what keeps search swappable and testable
 * without standing up a CMS.
 */

export interface SearchProviderOptions extends PostgresSearchOptions {
  provider: SearchProviderName
}

/**
 * Builds the configured provider.
 *
 * The Postgres adapter is the only one that needs the SQL executor, but it is
 * required on the options rather than optional: making it conditional would mean
 * a `postgres` deployment could start with no database handle and fail on the
 * first search instead of at boot.
 */
export function createSearchProvider(options: SearchProviderOptions): SearchProvider {
  switch (options.provider) {
    case 'postgres':
      return createPostgresSearchProvider(options)
    case 'meilisearch':
      return createMeilisearchProvider()
    case 'opensearch':
      return createOpenSearchProvider()
  }
}

export { createPostgresSearchProvider } from './postgres/index.js'
export type { PostgresSearchOptions } from './postgres/index.js'
export { SEARCH_TABLE } from './postgres/sql.js'
export type { SqlExecutor } from './postgres/sql.js'

export {
  HIGHLIGHT_END,
  HIGHLIGHT_START,
  parseSnippet,
  plainSnippet,
  snippetText,
  stripMarkers,
} from './highlight.js'

export {
  createMeilisearchProvider,
  createOpenSearchProvider,
  SearchProviderNotImplementedError,
} from './stubs.js'

export {
  DEFAULT_SEARCH_LIMIT,
  MAX_QUERY_LENGTH,
  MAX_SEARCH_LIMIT,
  type SearchDocument,
  type SearchDocumentRef,
  type SearchHit,
  type SearchProvider,
  type SearchRequest,
  type SearchResults,
  type SearchStrategy,
  type Snippet,
} from './types.js'
