/**
 * The minimum a Postgres client must provide.
 *
 * `pg.Pool` satisfies this, which is what the application passes — Payload's
 * Postgres adapter already owns a pool, and opening a second one for search
 * would double the connection count for no gain. Declared structurally rather
 * than importing `pg` so this package has no runtime dependencies at all.
 */
export interface SqlExecutor {
  query<Row extends Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Row[] }>
}

/** Table the adapter reads and writes. Created by a migration, not by Payload. */
export const SEARCH_TABLE = 'search_documents'
