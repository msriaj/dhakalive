import { defineConfig } from 'vitest/config'

const TEST_DATABASE_URI =
  process.env.TEST_DATABASE_URI ?? 'postgres://dhakalive:dhakalive@localhost:5432/dhakalive_test'

/**
 * Integration suite — boots Payload against a real PostgreSQL database.
 *
 * Kept separate from the unit config so `pnpm test` stays fast and dependency
 * free. This one is the slower gate that proves the access rules actually hold
 * through Payload's query layer.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['apps/web/tests/integration/**/*.test.ts'],
    globalSetup: ['apps/web/tests/setup/global-setup.ts'],

    // One Payload instance, one connection pool, deterministic ordering. Running
    // these in parallel would have several suites racing on the same tables.
    pool: 'forks',
    maxWorkers: 1,
    fileParallelism: false,

    testTimeout: 60_000,
    hookTimeout: 120_000,

    env: {
      APP_ENV: 'test',
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
      DATABASE_URI: TEST_DATABASE_URI,
      // The test database is disposable, so the schema is pushed rather than
      // migrated. `APP_ENV=test` means the production guard does not apply.
      DATABASE_PUSH: 'true',
      DATABASE_SSL: 'false',
      PAYLOAD_SECRET: 'integration-test-secret-value-at-least-32-chars',
      REVALIDATION_SECRET: 'integration-test-revalidation-secret',
    },
  },
})
