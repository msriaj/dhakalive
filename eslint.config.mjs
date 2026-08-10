import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      // Payload regenerates all of these; lint findings there are not actionable
      // and the migrations are deliberately outside the app's tsconfig program.
      '**/payload-types.ts',
      '**/importMap.js',
      '**/src/migrations/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // Only files outside every build tsconfig belong here. Anything the
          // project service already resolves (apps/web/*.ts) is a hard error.
          allowDefaultProject: ['*.mjs', 'apps/web/*.mjs'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // `any` defeats the point of running strict mode at all.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // A floating promise in a Payload hook silently drops a workflow step.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/require-await': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },

  // Next.js rules apply to the web app only; packages/* are framework-free.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [...nextCoreWebVitals],
    settings: { next: { rootDir: 'apps/web' } },
  },

  // Config files and scripts run in Node and legitimately log.
  {
    files: ['**/*.config.{ts,mts,js,mjs}', '**/scripts/**/*.ts', 'services/worker/**/*.ts'],
    rules: { 'no-console': 'off' },
  },

  // Plain JS/MJS config files carry no types to lint against.
  {
    files: ['**/*.mjs', '**/*.js', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // Maintenance scripts run in Node and report progress on stdout.
  {
    files: ['**/scripts/**/*.{mjs,js,ts}'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly', fetch: 'readonly', URL: 'readonly' },
    },
    rules: { 'no-console': 'off' },
  },

  // Tests assert on partially-typed fixtures; the unsafe-* family is noise there.
  {
    files: [
      '**/*.test.ts',
      '**/*.test.tsx',
      'tests/**/*.ts',
      'e2e/**/*.ts',
      'vitest.config.ts',
      'vitest.integration.config.ts',
      'playwright.config.ts',
    ],
    languageOptions: {
      parserOptions: {
        // Test and tooling files are excluded from the build projects so they
        // never reach `dist`; tsconfig.eslint.json is the program covering them.
        projectService: false,
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  prettier,
)
