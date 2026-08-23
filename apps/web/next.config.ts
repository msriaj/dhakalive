import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'

import { cacheHeaderRules } from './src/lib/cache/cache-policy'
import { localeRedirects, localeRewrites } from './src/lib/routing/locale-routing'

const appDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(appDir, '../..')

/**
 * Next only looks for `.env` inside its own project directory. The canonical
 * dev env file lives at the repo root so that the web app, the Payload CLI, the
 * worker and docker-compose all read one file — so it is loaded here, before
 * Next inlines any NEXT_PUBLIC_* value into the client bundle.
 *
 * `loadEnvFile` never overrides a variable that is already set, so real
 * container and CI environments still win.
 */
const rootEnvFile = path.join(repoRoot, '.env')
if (existsSync(rootEnvFile)) {
  try {
    process.loadEnvFile(rootEnvFile)
  } catch {
    // Validation in packages/config reports missing keys far more usefully
    // than a parser stack trace would.
  }
}

function buildRemotePatterns(): NonNullable<NextConfig['images']>['remotePatterns'] {
  const hosts = [process.env.CLOUDFLARE_MEDIA_PUBLIC_URL, process.env.NEXT_PUBLIC_SITE_URL]

  return hosts.flatMap((value) => {
    if (!value) return []
    try {
      const url = new URL(value)
      return [
        {
          protocol: url.protocol === 'https:' ? ('https' as const) : ('http' as const),
          hostname: url.hostname,
          pathname: '/**',
          ...(url.port ? { port: url.port } : {}),
        },
      ]
    } catch {
      return []
    }
  })
}

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Standalone output keeps the runtime image to the traced file set instead of
  // a full node_modules tree. `outputFileTracingRoot` is required in a pnpm
  // workspace or tracing stops at apps/web and drops the linked packages.
  output: 'standalone',
  outputFileTracingRoot: path.resolve(appDir, '../..'),

  // Never advertise the framework; it is free reconnaissance for an attacker.
  poweredByHeader: false,

  /**
   * Next writes an `AGENTS.md` and a `CLAUDE.md` into the app directory on every
   * dev boot. They are generated, uncommitted and would reappear as untracked
   * noise in every working tree; project-level agent instructions belong at the
   * repository root where they are reviewed like anything else.
   */
  agentRules: false,

  // Workspace packages ship compiled ESM, but Next still needs to be told they
  // are first-party so source maps and tree shaking behave.
  transpilePackages: [
    '@dhakalive/config',
    '@dhakalive/core',
    '@dhakalive/observability',
    '@dhakalive/search',
  ],

  // pino picks its transport at runtime; bundling it breaks worker threads.
  serverExternalPackages: ['pino', 'pino-pretty'],

  images: {
    /**
     * next/image refuses any host not listed here, returning 400.
     *
     * Two hosts matter. In production, media comes from the R2 custom domain.
     * In development there is no R2, so Payload serves uploads from the app's
     * own origin as *absolute* URLs — which the optimiser rejects unless that
     * origin is allowed too. Omitting it makes every image 400 locally while
     * working in production, which is the worst way to find out.
     */
    remotePatterns: buildRemotePatterns(),

    /**
     * WebP only, deliberately.
     *
     * AVIF encodes roughly ten times slower than WebP, and the optimiser runs
     * in the web container on the request path. Measured against production
     * with AVIF enabled, a cold hero was 1.9s at the 750px width phones ask
     * for and 3.8s at 1200px, against 20-80ms once Cloudflare held the result
     * — so the first reader of every article paid seconds for a file the
     * next one got instantly. The AVIF file is perhaps 20% smaller; on a
     * Dhaka mobile connection that is worth far less than the seconds.
     */
    formats: ['image/webp'],

    /**
     * An optimised derivative of an immutable upload never changes, so the
     * four-hour default only guarantees the encode is thrown away and redone
     * several times a day. Media that is genuinely replaced gets a new
     * filename from Payload, which is a new cache key.
     */
    minimumCacheTTL: 31_536_000,

    /**
     * Every width in these lists is a separate encode of every image, so the
     * lists should stop where the source images do.
     *
     * Ingested photographs arrive at 1200px wide. Next never upscales, so
     * asking for 1920 returns the same pixels as 1200 — byte for byte, when
     * checked against production — while costing another encode and another
     * cache entry. The default list runs to 3840, which is three redundant
     * widths. The small end below 64px is unused because the smallest image
     * on any page is a 128px thumbnail.
     *
     * Raise the ceiling if originals ever get bigger: at that point a hero at
     * 1024 CSS pixels on a 2x screen genuinely wants 2048.
     */
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [64, 128, 256, 384],
  },

  experimental: {
    // Payload's admin bundle is large; this keeps dev rebuilds from re-walking it.
    optimizePackageImports: ['@payloadcms/ui'],
  },

  // Cache policy lives in lib/cache/cache-policy.ts so it can be unit-tested.
  headers: () => Promise.resolve(cacheHeaderRules()),

  /**
   * Bengali is served at the root. Both rule sets live in
   * lib/routing/locale-routing.ts so they can be unit-tested — see the note
   * there on why the rewrite has to run before the filesystem.
   */
  redirects: () => Promise.resolve(localeRedirects()),
  rewrites: () => Promise.resolve({ beforeFiles: localeRewrites(), afterFiles: [], fallback: [] }),
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
