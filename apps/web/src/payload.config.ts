import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import { buildConfig, type Plugin } from 'payload'
import sharp from 'sharp'

import { DEFAULT_LOCALE } from '@dhakalive/config'

import { Articles } from './collections/Articles'
import { Authors } from './collections/Authors'
import { Categories } from './collections/Categories'
import { LiveBlogUpdates } from './collections/LiveBlogUpdates'
import { LiveBlogs } from './collections/LiveBlogs'
import { MAX_UPLOAD_BYTES, Media } from './collections/Media'
import { Tags } from './collections/Tags'
import { Users } from './collections/Users'
import { env } from './lib/env'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const serverEnv = env()

/**
 * R2 is attached only when it is configured.
 *
 * Environment validation already refuses to start in production without the
 * full R2 credential set, so this conditional only ever falls back to local disk
 * during development. It is not a production escape hatch.
 */
const storagePlugins: Plugin[] =
  serverEnv.CLOUDFLARE_R2_BUCKET &&
  serverEnv.CLOUDFLARE_R2_ENDPOINT &&
  serverEnv.CLOUDFLARE_R2_ACCESS_KEY_ID &&
  serverEnv.CLOUDFLARE_R2_SECRET_ACCESS_KEY
    ? [
        s3Storage({
          collections: {
            media: {
              // Public objects are served from the R2 custom domain, so the
              // bytes never transit the application.
              prefix: 'media',
              generateFileURL: ({ filename, prefix }: { filename: string; prefix?: string }) =>
                serverEnv.CLOUDFLARE_MEDIA_PUBLIC_URL
                  ? `${serverEnv.CLOUDFLARE_MEDIA_PUBLIC_URL.replace(/\/$/, '')}/${prefix ? `${prefix}/` : ''}${filename}`
                  : filename,
            },
          },
          bucket: serverEnv.CLOUDFLARE_R2_BUCKET,
          config: {
            endpoint: serverEnv.CLOUDFLARE_R2_ENDPOINT,
            // R2 has no regions, but the S3 client requires a value and rejects
            // path-style addressing unless it is asked for explicitly.
            region: serverEnv.CLOUDFLARE_R2_REGION,
            forcePathStyle: serverEnv.CLOUDFLARE_R2_FORCE_PATH_STYLE,
            credentials: {
              accessKeyId: serverEnv.CLOUDFLARE_R2_ACCESS_KEY_ID,
              secretAccessKey: serverEnv.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
            },
          },
        }),
      ]
    : []

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

  collections: [Articles, Categories, Tags, Authors, Media, LiveBlogs, LiveBlogUpdates, Users],
  globals: [],

  plugins: storagePlugins,

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

  /**
   * Transport-level upload cap, so an oversized HTTP body is refused before it
   * is buffered. The Media collection re-checks in a hook, which is what covers
   * programmatic uploads — imports, seeds and migrations never touch this path.
   */
  upload: {
    limits: { fileSize: MAX_UPLOAD_BYTES },
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
