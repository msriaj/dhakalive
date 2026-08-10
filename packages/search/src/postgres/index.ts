import type { Locale } from '@dhakalive/config'

import {
  HIGHLIGHT_END,
  HIGHLIGHT_START,
  parseSnippet,
  plainSnippet,
  stripMarkers,
} from '../highlight.js'
import {
  DEFAULT_SEARCH_LIMIT,
  MAX_QUERY_LENGTH,
  MAX_SEARCH_LIMIT,
  type SearchDocumentRef,
  type SearchHit,
  type SearchProvider,
  type SearchRequest,
  type SearchResults,
} from '../types.js'
import { SEARCH_TABLE, type SqlExecutor } from './sql.js'

/**
 * Postgres full-text search.
 *
 * ## Why Postgres, and what that costs
 *
 * The site is bilingual, and Postgres has no Bengali stemmer or stop-word list —
 * `to_tsvector('bengali', …)` does not exist. English rows are therefore indexed
 * with the `english` configuration and Bengali rows with `simple`, chosen per row
 * by the generated column. `simple` means no stemming: a search for "নির্বাচনের"
 * will not match "নির্বাচন".
 *
 * That gap is what `pg_trgm` covers. When the full-text pass returns nothing, a
 * trigram-similarity pass runs over the title and summary, which matches partial
 * words and typos in either script. The two passes are reported separately as
 * the result `strategy`, so the page can tell the reader when it is guessing.
 *
 * `unaccent` normalises Latin diacritics on both sides of the comparison. It
 * does nothing for Bengali — which is precisely why the trigram pass matters
 * more here than it would for a monolingual English site.
 *
 * ## Schema ownership
 *
 * `search_documents` is created by a hand-written migration and is invisible to
 * Payload. That is deliberate: a generated `tsvector` column and a GIN index
 * cannot be expressed in a collection config, and a table Payload knows about
 * would have those stripped the next time someone ran `migrate:create`.
 */

/**
 * Text search configuration per locale.
 *
 * `simple` for Bengali is not a placeholder for a better dictionary later — it
 * is the correct choice today. A wrong stemmer is worse than none: applying
 * English suffix rules to Bengali text produces lexemes that match nothing.
 */
const TEXT_SEARCH_CONFIG: Readonly<Record<Locale, string>> = {
  bn: 'simple',
  en: 'english',
}

/**
 * Below three characters a trigram query has at most one trigram to work with
 * and matches almost everything. The full-text pass still runs for short
 * queries; only the fuzzy fallback is skipped.
 */
const MIN_FUZZY_QUERY_LENGTH = 3

const HEADLINE_TITLE_OPTIONS = `StartSel=${HIGHLIGHT_START}, StopSel=${HIGHLIGHT_END}, HighlightAll=TRUE`

const HEADLINE_BODY_OPTIONS = `StartSel=${HIGHLIGHT_START}, StopSel=${HIGHLIGHT_END}, MaxWords=45, MinWords=25, ShortWord=2, MaxFragments=1, FragmentDelimiter=" … "`

const SELECTED_COLUMNS = `
  collection,
  document_id,
  locale,
  url,
  title,
  summary,
  section_title,
  authors,
  image_url,
  published_at
`

interface HitRow extends Record<string, unknown> {
  collection: string
  document_id: string
  locale: string
  url: string
  title: string
  summary: string | null
  section_title: string | null
  authors: string[] | null
  image_url: string | null
  published_at: Date | string | null
  score: number | string
  total: number | string
  title_headline?: string | null
  body_headline?: string | null
}

export interface PostgresSearchOptions {
  sql: SqlExecutor
  /** Called with the SQL duration of slow queries. Optional by design. */
  onSlowQuery?: (details: { ms: number; strategy: string; query: string }) => void
  /** Milliseconds above which `onSlowQuery` fires. */
  slowQueryMs?: number
}

export function createPostgresSearchProvider(options: PostgresSearchOptions): SearchProvider {
  const { sql, onSlowQuery, slowQueryMs = 500 } = options

  const report = (ms: number, strategy: string, query: string): void => {
    if (onSlowQuery && ms >= slowQueryMs) onSlowQuery({ ms, strategy, query })
  }

  return {
    name: 'postgres',

    async index(documents) {
      if (documents.length === 0) return

      const columns = [
        'collection',
        'document_id',
        'locale',
        'url',
        'title',
        'summary',
        'body',
        'section',
        'section_title',
        'tags',
        'authors',
        'article_type',
        'image_url',
        'published_at',
      ]

      const values: unknown[] = []
      const rows = documents.map((document) => {
        const start = values.length
        values.push(
          document.collection,
          document.documentId,
          document.locale,
          document.url,
          // Markers are stripped on the way in, so a document cannot forge a
          // highlight run and smuggle structure into a rendered result.
          stripMarkers(document.title),
          document.summary ? stripMarkers(document.summary) : null,
          document.body ? stripMarkers(document.body) : null,
          document.section ?? null,
          document.sectionTitle ? stripMarkers(document.sectionTitle) : null,
          document.tags ? [...document.tags] : [],
          document.authors ? [...document.authors] : [],
          document.articleType ?? null,
          document.imageUrl ?? null,
          document.publishedAt ?? null,
        )
        const placeholders = columns.map((_column, offset) => `$${start + offset + 1}`)
        return `(${placeholders.join(', ')})`
      })

      /**
       * One statement for the whole batch, and an upsert rather than
       * delete-then-insert: a reader searching mid-reindex must never see the
       * document vanish. `search_vector` is generated, so it is never written.
       */
      await sql.query(
        `INSERT INTO ${SEARCH_TABLE} (${columns.join(', ')})
         VALUES ${rows.join(', ')}
         ON CONFLICT (collection, document_id, locale) DO UPDATE SET
           url = EXCLUDED.url,
           title = EXCLUDED.title,
           summary = EXCLUDED.summary,
           body = EXCLUDED.body,
           section = EXCLUDED.section,
           section_title = EXCLUDED.section_title,
           tags = EXCLUDED.tags,
           authors = EXCLUDED.authors,
           article_type = EXCLUDED.article_type,
           image_url = EXCLUDED.image_url,
           published_at = EXCLUDED.published_at,
           indexed_at = now()`,
        values,
      )
    },

    async remove(refs: readonly SearchDocumentRef[]) {
      if (refs.length === 0) return

      const values: unknown[] = []
      const tuples = refs.map((ref) => {
        const start = values.length
        values.push(ref.collection, ref.documentId, ref.locale)
        return `($${start + 1}, $${start + 2}, $${start + 3})`
      })

      await sql.query(
        `DELETE FROM ${SEARCH_TABLE}
         WHERE (collection, document_id, locale) IN (${tuples.join(', ')})`,
        values,
      )
    },

    async removeDocument(collection: string, documentId: string) {
      await sql.query(`DELETE FROM ${SEARCH_TABLE} WHERE collection = $1 AND document_id = $2`, [
        collection,
        documentId,
      ])
    },

    async search(request: SearchRequest): Promise<SearchResults> {
      const started = Date.now()
      const query = request.query.trim().slice(0, MAX_QUERY_LENGTH)
      const limit = Math.min(Math.max(request.limit ?? DEFAULT_SEARCH_LIMIT, 1), MAX_SEARCH_LIMIT)
      const offset = Math.max(request.offset ?? 0, 0)
      const section = request.section ?? null
      const config = TEXT_SEARCH_CONFIG[request.locale]

      if (query.length === 0) {
        return { hits: [], total: 0, strategy: 'empty', tookMs: 0 }
      }

      const fullText = await runFullText(sql, {
        config,
        query,
        locale: request.locale,
        section,
        limit,
        offset,
      })

      if (fullText.rows.length > 0) {
        const tookMs = Date.now() - started
        report(tookMs, 'full-text', query)
        return {
          hits: fullText.rows.map(toHit),
          total: totalOf(fullText.rows),
          strategy: 'full-text',
          tookMs,
        }
      }

      /**
       * Nothing matched the words as written. Before reporting no results, try
       * trigram similarity — this is what catches a Bengali inflected form, a
       * transliteration, or a plain typo.
       */
      if (query.length >= MIN_FUZZY_QUERY_LENGTH) {
        const fuzzy = await runFuzzy(sql, {
          query,
          locale: request.locale,
          section,
          limit,
          offset,
        })

        if (fuzzy.rows.length > 0) {
          const tookMs = Date.now() - started
          report(tookMs, 'fuzzy', query)
          return {
            hits: fuzzy.rows.map(toHit),
            total: totalOf(fuzzy.rows),
            strategy: 'fuzzy',
            tookMs,
          }
        }
      }

      const tookMs = Date.now() - started
      report(tookMs, 'full-text', query)
      return { hits: [], total: 0, strategy: 'full-text', tookMs }
    },

    async healthy() {
      try {
        const result = await sql.query<{ present: string | null }>(
          `SELECT to_regclass($1) AS present`,
          [`public.${SEARCH_TABLE}`],
        )
        return Boolean(result.rows[0]?.present)
      } catch {
        // A health probe that throws is a health probe that takes down /ready.
        return false
      }
    },
  }
}

interface FullTextArgs {
  config: string
  query: string
  locale: Locale
  section: string | null
  limit: number
  offset: number
}

async function runFullText(sql: SqlExecutor, args: FullTextArgs): Promise<{ rows: HitRow[] }> {
  /**
   * `websearch_to_tsquery` rather than `plainto_tsquery`: it understands quoted
   * phrases and `-excluded`, which readers type whether or not the product ever
   * advertised them, and it cannot produce a syntax error from arbitrary input
   * the way `to_tsquery` can.
   *
   * `ts_headline` runs against the raw title, not the unaccented one, so the
   * snippet shows the text as written. The cost is that a match found only after
   * accent folding may come back unhighlighted — a cosmetic loss, and the right
   * trade against displaying "cafe" where the story said "café".
   */
  return sql.query<HitRow>(
    `WITH q AS (
       SELECT websearch_to_tsquery($1::regconfig, dhakalive_unaccent($2)) AS query
     )
     SELECT ${SELECTED_COLUMNS},
       ts_rank_cd(search_vector, q.query, 32) AS score,
       ts_headline($1::regconfig, title, q.query, $7) AS title_headline,
       ts_headline($1::regconfig, coalesce(summary, left(coalesce(body, ''), 4000)), q.query, $8)
         AS body_headline,
       count(*) OVER () AS total
     FROM ${SEARCH_TABLE}, q
     WHERE locale = $3
       AND search_vector @@ q.query
       AND ($4::text IS NULL OR section = $4)
     ORDER BY score DESC, published_at DESC NULLS LAST
     LIMIT $5 OFFSET $6`,
    [
      args.config,
      args.query,
      args.locale,
      args.section,
      args.limit,
      args.offset,
      HEADLINE_TITLE_OPTIONS,
      HEADLINE_BODY_OPTIONS,
    ],
  )
}

async function runFuzzy(
  sql: SqlExecutor,
  args: Omit<FullTextArgs, 'config'>,
): Promise<{ rows: HitRow[] }> {
  /**
   * `<%` is word similarity, not string similarity, and the difference decides
   * whether this fallback works at all. `similarity('বাজেটের', <a full
   * headline>)` is near zero simply because the headline is long; `'বাজেটের' <%
   * headline` compares the query against the closest *word* in it and scores
   * 0.6. Since the query is usually one or two words and the target is a
   * sentence, string similarity would reject almost every true match.
   *
   * Both operators are index-backed by the GIN trigram indexes. Ranking takes
   * the better of title and summary, so a story carrying the term in its
   * headline outranks one that only mentions it in a standfirst.
   */
  return sql.query<HitRow>(
    `SELECT ${SELECTED_COLUMNS},
       greatest(
         word_similarity($1, title),
         word_similarity($1, coalesce(summary, ''))
       ) AS score,
       count(*) OVER () AS total
     FROM ${SEARCH_TABLE}
     WHERE locale = $2
       AND ($3::text IS NULL OR section = $3)
       AND ($1 <% title OR $1 <% coalesce(summary, ''))
     ORDER BY score DESC, published_at DESC NULLS LAST
     LIMIT $4 OFFSET $5`,
    [args.query, args.locale, args.section, args.limit, args.offset],
  )
}

function totalOf(rows: readonly HitRow[]): number {
  const first = rows[0]
  if (!first) return 0
  return Number(first.total) || rows.length
}

function toHit(row: HitRow): SearchHit {
  const publishedAt =
    row.published_at instanceof Date ? row.published_at.toISOString() : (row.published_at ?? null)

  return {
    collection: row.collection,
    documentId: row.document_id,
    locale: row.locale as Locale,
    url: row.url,
    title: row.title,
    summary: row.summary,
    sectionTitle: row.section_title,
    authors: row.authors ?? [],
    imageUrl: row.image_url,
    publishedAt,
    score: Number(row.score) || 0,
    // The fuzzy path has no headline, so fall back to the plain text.
    titleSnippet: row.title_headline ? parseSnippet(row.title_headline) : plainSnippet(row.title),
    bodySnippet: row.body_headline ? parseSnippet(row.body_headline) : plainSnippet(row.summary),
  }
}
