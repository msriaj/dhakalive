import { createSearchProvider, type SearchProvider, type SqlExecutor } from '@dhakalive/search'
import { getLogger } from '@dhakalive/observability'
import type { Payload } from 'payload'

import { env } from '../env'

/**
 * Builds the configured search provider.
 *
 * Deliberately no `server-only` import. This module is loaded by the job runner
 * and by the reindex script as well as by Next, and a `server-only` import chain
 * makes every non-Next process fail at startup — the same reason the
 * revalidation hooks defer their imports.
 *
 * The Postgres adapter is handed Payload's own connection pool rather than
 * opening one of its own. Two pools against the same database would double the
 * connection count for no gain and would make `DATABASE_POOL_MAX` a lie.
 */

let provider: SearchProvider | undefined

/**
 * Payload's `db` is typed as the generic adapter interface, which does not
 * declare `pool`. It is there on the Postgres adapter, so the shape is checked
 * at runtime instead of asserted — a misconfigured adapter should fail with a
 * sentence, not with `undefined is not a function` several frames later.
 */
function sqlExecutorFor(payload: Payload): SqlExecutor {
  const candidate = (payload.db as unknown as { pool?: unknown }).pool

  if (!candidate || typeof (candidate as { query?: unknown }).query !== 'function') {
    throw new Error(
      'Search needs the Postgres connection pool, which is not present on the configured database adapter.',
    )
  }

  return candidate as SqlExecutor
}

export function getSearchProvider(payload: Payload): SearchProvider {
  if (provider) return provider

  const serverEnv = env()
  const logger = getLogger()

  provider = createSearchProvider({
    provider: serverEnv.SEARCH_PROVIDER,
    sql: sqlExecutorFor(payload),
    /**
     * Slow searches are logged rather than counted, because the useful artefact
     * is the query text: a search that takes a second is almost always one term
     * against a large section, and knowing which term is what leads to the fix.
     */
    onSlowQuery: ({ ms, strategy, query }) => {
      logger.warn({ ms, strategy, queryLength: query.length }, 'Slow search query')
    },
  })

  return provider
}

/** Test seam, and the reset the reindex script uses between runs. */
export function setSearchProvider(next: SearchProvider | undefined): void {
  provider = next
}
