import type { Locale, SearchProviderName } from '@dhakalive/config'

/**
 * The search contract.
 *
 * One interface, three intended implementations: Postgres full text (shipped),
 * Meilisearch and OpenSearch (stubs). The point of the abstraction is that
 * moving to a dedicated engine is a configuration change and one new file, not
 * a rewrite of the search page and the indexing jobs.
 *
 * Nothing here imports Payload or Next. The adapters receive a SQL executor or
 * an HTTP client from the caller, which is what keeps them testable and keeps
 * the CMS out of the query path.
 */

/** Identifies one indexed document. A document exists once per locale. */
export interface SearchDocumentRef {
  collection: string
  documentId: string
  locale: Locale
}

/**
 * A document as the index stores it.
 *
 * Denormalised on purpose. A search result renders a card — headline, section,
 * byline, image, date — and joining back to five tables per hit is what makes
 * search slow. The indexer flattens; the reader never joins.
 */
export interface SearchDocument extends SearchDocumentRef {
  /** Public path, already localised. */
  url: string
  title: string
  summary?: string | null
  /** Plain text extracted from rich text. Never markup. */
  body?: string | null
  /** Primary category slug, for filtering. */
  section?: string | null
  sectionTitle?: string | null
  tags?: readonly string[]
  authors?: readonly string[]
  articleType?: string | null
  imageUrl?: string | null
  publishedAt?: string | null
}

export interface SearchRequest {
  query: string
  locale: Locale
  /** Results per page. Adapters clamp this; callers should not have to. */
  limit?: number
  offset?: number
  /** Category slug. */
  section?: string | null
}

/**
 * One run of highlighted text.
 *
 * Deliberately structured rather than a string of `<mark>` tags: an HTML string
 * from the database would have to be injected with `dangerouslySetInnerHTML`,
 * and search results are built from user-supplied query terms. Segments let the
 * renderer emit real elements and keep escaping to React.
 */
export interface Snippet {
  text: string
  match: boolean
}

export interface SearchHit {
  collection: string
  documentId: string
  locale: Locale
  url: string
  title: string
  summary: string | null
  sectionTitle: string | null
  authors: string[]
  imageUrl: string | null
  publishedAt: string | null
  /** Relevance, adapter-specific scale. Only the ordering is meaningful. */
  score: number
  /** Title with the matching terms marked. Falls back to one unmatched run. */
  titleSnippet: Snippet[]
  /** Extract from the summary or body, matching terms marked. */
  bodySnippet: Snippet[]
}

/**
 * Which path produced the results.
 *
 * Surfaced because it changes what the reader should be told: `fuzzy` means
 * nothing matched the words they typed and these are approximate — worth saying
 * out loud rather than presenting as exact hits.
 */
export type SearchStrategy = 'full-text' | 'fuzzy' | 'empty'

export interface SearchResults {
  hits: SearchHit[]
  /** Total matches, not the number returned. Drives pagination. */
  total: number
  strategy: SearchStrategy
  /** Round-trip time, for logging slow queries. */
  tookMs: number
}

export interface SearchProvider {
  readonly name: SearchProviderName

  /** Upsert. Called with every locale of a document at once where possible. */
  index(documents: readonly SearchDocument[]): Promise<void>

  /** Removes specific locales of a document. */
  remove(refs: readonly SearchDocumentRef[]): Promise<void>

  /** Removes every locale of a document — deletion, or unpublication. */
  removeDocument(collection: string, documentId: string): Promise<void>

  search(request: SearchRequest): Promise<SearchResults>

  /** Cheap liveness probe for `/api/ready`. Never throws. */
  healthy(): Promise<boolean>
}

export const DEFAULT_SEARCH_LIMIT = 20
export const MAX_SEARCH_LIMIT = 50
/** Longer queries are truncated: they are pathological, not sincere. */
export const MAX_QUERY_LENGTH = 200
