import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'

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

  // Workspace packages ship compiled ESM, but Next still needs to be told they
  // are first-party so source maps and tree shaking behave.
  transpilePackages: ['@dhakalive/config', '@dhakalive/core', '@dhakalive/observability'],

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
    formats: ['image/avif', 'image/webp'],
  },

  experimental: {
    // Payload's admin bundle is large; this keeps dev rebuilds from re-walking it.
    optimizePackageImports: ['@payloadcms/ui'],
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
