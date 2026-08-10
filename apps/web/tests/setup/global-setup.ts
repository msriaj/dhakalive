import { Client } from 'pg'

/**
 * Creates a throwaway database for the integration suite.
 *
 * The suite runs against a real PostgreSQL instance rather than a mock, because
 * the permission rules that matter most are the ones Payload turns into SQL —
 * a `Where` constraint returned from an access callback cannot be verified
 * without executing the query it produces.
 *
 * The database is dropped and recreated per run, and the schema is built by
 * Payload's dev push rather than by migrations: it is disposable, so the extra
 * fidelity of replaying migrations is not worth the runtime.
 */

const ADMIN_URI =
  process.env.TEST_ADMIN_DATABASE_URI ?? 'postgres://dhakalive:dhakalive@localhost:5432/postgres'
const TEST_DATABASE = process.env.TEST_DATABASE_NAME ?? 'dhakalive_test'

export async function setup(): Promise<void> {
  const client = new Client({ connectionString: ADMIN_URI })

  try {
    await client.connect()
  } catch (error) {
    throw new Error(
      `Integration tests need PostgreSQL at ${ADMIN_URI.replace(/:\/\/[^@]*@/, '://***@')}. ` +
        `Start it with \`docker compose up -d postgres\`.\n${String(error)}`,
    )
  }

  try {
    // Terminate stragglers first; DROP DATABASE fails while any session is open.
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [TEST_DATABASE],
    )
    // Identifiers cannot be parameterised, hence the interpolation. The value is
    // an internal constant, never request-derived.
    await client.query(`DROP DATABASE IF EXISTS "${TEST_DATABASE}"`)
    /**
     * `template0` plus an explicit ctype, matching the development database.
     * Inheriting from `template1` would take whatever locale the cluster was
     * initialised with — usually `C`, under which `pg_trgm` extracts no trigrams
     * from Bengali and every fuzzy-search assertion would pass locally and fail
     * on a correctly configured machine, or the reverse.
     */
    await client.query(
      `CREATE DATABASE "${TEST_DATABASE}"
       TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C.UTF-8'`,
    )
  } finally {
    await client.end()
  }
}

export async function teardown(): Promise<void> {
  // The database is intentionally left in place so a failing run can be
  // inspected. The next run drops it.
}
