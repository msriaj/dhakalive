import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'
import sharp from 'sharp'

import { DEFAULT_LOCALE } from '@dhakalive/config'

import { Users } from './collections/Users'
import { env } from './lib/env'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const serverEnv = env()

export default buildConfig({
  serverURL: serverEnv.NEXT_PUBLIC_SITE_URL,
  secret: serverEnv.PAYLOAD_SECRET,

  admin: {
    user: Users.slug,
    importMap: { baseDir: path.resolve(dirname, 'app/(payload)') },
    meta: {
      titleSuffix: '— DhakaLive CMS',
    },
  },

  collections: [Users],
  globals: [],

  editor: lexicalEditor(),

  db: postgresAdapter({
    pool: {
      connectionString: serverEnv.DATABASE_URI,
      min: serverEnv.DATABASE_POOL_MIN,
      max: serverEnv.DATABASE_POOL_MAX,
      // Managed Postgres terminates idle connections; recycling ours first
      // avoids the "Connection terminated unexpectedly" class of 500s.
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ...(serverEnv.DATABASE_SSL ? { ssl: { rejectUnauthorized: true } } : {}),
    },
    // `push` mutates schema with no migration file and no review step. Env
    // validation already refuses to enable it in production; this keeps the
    // default off everywhere else too.
    push: serverEnv.DATABASE_PUSH,
    migrationDir: path.resolve(dirname, 'migrations'),
  }),

  localization: {
    locales: [
      { label: { en: 'Bengali', bn: 'বাংলা' }, code: 'bn' },
      { label: { en: 'English', bn: 'ইংরেজি' }, code: 'en' },
    ],
    defaultLocale: DEFAULT_LOCALE,
    // Fall back to the default locale so a story translated only into Bengali
    // still renders on an English route rather than 404-ing.
    fallback: true,
  },

  // sharp powers responsive image sizes and metadata stripping on upload.
  sharp,

  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },

  graphQL: {
    // Unbounded query depth is a denial-of-service vector on a public API.
    maxComplexity: 1000,
    disablePlaygroundInProduction: true,
  },

  // Same-origin only. Phase 8 widens this to the explicit mobile-app origins;
  // a wildcard is never correct for a cookie-authenticated API.
  cors: [serverEnv.NEXT_PUBLIC_SITE_URL],
  csrf: [serverEnv.NEXT_PUBLIC_SITE_URL],
})
