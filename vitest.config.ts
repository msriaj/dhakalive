import { defineConfig } from 'vitest/config'

/**
 * Unit and integration tests run in the Node environment. There is no jsdom or
 * React plugin here on purpose: domain rules live in `packages/*` as plain
 * TypeScript, so the suite that guards access control and the article workflow
 * has no framework in its path and stays fast.
 */
export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts', 'apps/web/src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', 'e2e/**'],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts', '**/dist/**'],
    },
  },
})
