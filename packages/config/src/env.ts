import { z } from 'zod'

/**
 * Fail-fast environment validation.
 *
 * Two schemas, deliberately separate:
 *   - `serverEnvSchema` may contain secrets and is parsed only in Node contexts.
 *   - `clientEnvSchema` is restricted to `NEXT_PUBLIC_*` and is the only thing that
 *     is ever allowed to reach a browser bundle.
 *
 * Nothing here ever echoes a value back in an error message. A misconfigured
 * secret should produce "PAYLOAD_SECRET: too short", never the secret itself.
 */

const NODE_ENVS = ['development', 'test', 'production'] as const
export type NodeEnvName = (typeof NODE_ENVS)[number]

/**
 * Deployment stage, deliberately separate from NODE_ENV.
 *
 * NODE_ENV is a *build* concept — `next build` forces it to `production` even
 * for a local build, and every built artifact reports `production` regardless of
 * where it runs. Keying the production safety rules on it would fail a
 * developer's build and would still not distinguish staging from production.
 * APP_ENV is the deployment concept, and it is what those rules check.
 */
const APP_ENVS = ['development', 'test', 'staging', 'production'] as const
export type AppEnvName = (typeof APP_ENVS)[number]

const SEARCH_PROVIDERS = ['postgres', 'meilisearch', 'opensearch'] as const
export type SearchProviderName = (typeof SEARCH_PROVIDERS)[number]

// `silent` is a real pino level and the right setting for test runs.
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const

const optionalString = z.string().trim().min(1).optional()

const requiredString = (min = 1) => z.string().trim().min(min)

/**
 * `.env` templates carry empty placeholders (`CLOUDFLARE_R2_ENDPOINT=`). An
 * empty string is "not configured", not "configured as the empty string", so it
 * is dropped before validation — otherwise every optional URL fails to parse.
 */
function stripEmptyValues(
  source: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> {
  const cleaned: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string' && value.trim() === '') continue
    cleaned[key] = value
  }
  return cleaned
}

const booleanFromString = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1')

const port = z.coerce.number().int().min(1).max(65535)

/**
 * True when a Postgres URI addresses a host that cannot be reached from off the
 * machine: loopback, an RFC1918 address, or a single-label name (a Docker
 * service alias such as `postgres`, which only resolves inside the network).
 *
 * Anything else — a public IP, or any dotted name that could leave the host —
 * is treated as remote, so a typo in the hostname cannot quietly turn into
 * plaintext Postgres traffic across the internet.
 */
export function isLocalDatabaseHost(uri: string): boolean {
  let hostname: string
  try {
    hostname = new URL(uri).hostname
  } catch {
    // Unparseable URIs are rejected elsewhere; refuse the exemption here.
    return false
  }

  // URL() keeps IPv6 literals in brackets.
  const host = hostname.replace(/^\[|]$/g, '').toLowerCase()
  if (host === 'localhost' || host === '::1' || host === '127.0.0.1') return true
  if (host.startsWith('127.')) return true
  if (host.startsWith('10.')) return true
  if (host.startsWith('192.168.')) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true

  // A name with no dot cannot be resolved by public DNS.
  return host.length > 0 && !host.includes('.') && !host.includes(':')
}

/**
 * Whether the session cookie should carry the `Secure` flag.
 *
 * Derived from the scheme the site is actually served over, not from APP_ENV.
 * A browser silently discards a Secure cookie sent over http://, and the
 * symptom is invisible: the login request returns 200 and the admin bounces
 * straight back to the login form with no error anywhere.
 *
 * https:// is the normal production answer, including behind a TLS-terminating
 * proxy — what matters is the scheme the browser used, not the origin hop.
 * http://localhost is treated as secure because browsers class localhost as a
 * trustworthy origin and will store Secure cookies from it, which is what makes
 * an SSH tunnel a usable way in before DNS exists.
 */
export function shouldUseSecureCookies(siteUrl: string): boolean {
  let url: URL
  try {
    url = new URL(siteUrl)
  } catch {
    // Unparseable: choose the safe side. A dropped cookie is a visible failure;
    // a cookie sent in clear is a silent one.
    return true
  }

  if (url.protocol === 'https:') return true
  return url.hostname !== 'localhost' && url.hostname !== '127.0.0.1' && url.hostname !== '::1'
}

/**
 * A GA4 measurement id, `G-` and ten upper-case alphanumerics.
 *
 * Validated rather than taken as a string because the failure is otherwise
 * invisible: a typo'd id is accepted by Google's tag, reports nothing, and
 * looks exactly like a site with no traffic. Better to refuse the build.
 */
const gaMeasurementId = z
  .string()
  .trim()
  .regex(/^G-[A-Z0-9]{10}$/, 'must look like G-XXXXXXXXXX')

/**
 * The site's own GA4 property, used when nothing overrides it.
 *
 * A measurement id is not a secret — it ships in the page source of every site
 * that uses one — so it lives here rather than in a repository variable that a
 * fresh clone or a new environment would have to be told about separately. One
 * literal, in reviewed code, instead of a value that silently differs between
 * the Dockerfile, CI and someone's shell.
 */
export const DEFAULT_GA_MEASUREMENT_ID = 'G-WJ1FKZHE2E'

export const clientEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url(),
  NEXT_PUBLIC_MEDIA_URL: z.url().optional(),
  /**
   * Which service resizes images. `cloudflare` routes them through
   * `/cdn-cgi/image/` at the edge; `next` runs sharp in the web container on
   * the request path, which is what made cold images cost seconds and what
   * starved the React render while it encoded.
   *
   * Cloudflare is the default now that transformations are enabled on the
   * media zone. `next` remains the escape hatch: it is the setting to reach
   * for if transformations are ever disabled or start costing more than they
   * are worth, and it needs no code change, only a rebuild.
   */
  NEXT_PUBLIC_IMAGE_CDN: z.enum(['cloudflare', 'next']).default('cloudflare'),
  NEXT_PUBLIC_DEFAULT_LOCALE: z.enum(['bn', 'en']).default('bn'),
  NEXT_PUBLIC_APP_VERSION: optionalString,
  /** Unset disables analytics entirely — which is what local and CI want. */
  NEXT_PUBLIC_GA_ID: gaMeasurementId.optional(),
})

export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(NODE_ENVS).default('development'),
    /** Deployment stage. Drives the production safety rules below. */
    APP_ENV: z.enum(APP_ENVS).default('development'),

    // --- Application identity -------------------------------------------------
    NEXT_PUBLIC_SITE_URL: z.url(),
    NEXT_PUBLIC_DEFAULT_LOCALE: z.enum(['bn', 'en']).default('bn'),
    /** Commit SHA or release tag, surfaced by /api/health for deploy correlation. */
    NEXT_PUBLIC_APP_VERSION: optionalString,
    NEXT_PUBLIC_GA_ID: gaMeasurementId.optional(),

    // --- Payload --------------------------------------------------------------
    // 32 chars is the floor for the key that signs auth cookies and reset tokens.
    PAYLOAD_SECRET: requiredString(32),

    // --- PostgreSQL -----------------------------------------------------------
    DATABASE_URI: requiredString(),
    DATABASE_POOL_MIN: z.coerce.number().int().min(0).default(2),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).default(10),
    DATABASE_SSL: booleanFromString.default(false),
    /**
     * Deliberate opt-out from the production TLS requirement, for the case where
     * Postgres runs on the same host as the app and is reachable only over a
     * Docker bridge — the traffic never touches a network, and terminating TLS
     * against a self-signed cert on localhost buys nothing.
     *
     * Only honoured when DATABASE_URI points at a loopback, private-range or
     * single-label (container) host. Aimed at a public database it is ignored
     * and the TLS requirement still fails the boot.
     */
    DATABASE_ALLOW_UNENCRYPTED: booleanFromString.default(false),
    /**
     * Drizzle `push` rewrites schema without a migration file. Safe in dev, a
     * data-loss vector anywhere else, so it is opt-in and refused in production.
     */
    DATABASE_PUSH: booleanFromString.default(false),

    // --- Cloudflare R2 (S3-compatible) ---------------------------------------
    CLOUDFLARE_ACCOUNT_ID: optionalString,
    CLOUDFLARE_R2_BUCKET: optionalString,
    CLOUDFLARE_R2_ACCESS_KEY_ID: optionalString,
    CLOUDFLARE_R2_SECRET_ACCESS_KEY: optionalString,
    CLOUDFLARE_R2_ENDPOINT: z.url().optional(),
    /** R2 ignores regions but the S3 client requires one; `auto` is the documented value. */
    CLOUDFLARE_R2_REGION: z.string().trim().default('auto'),
    CLOUDFLARE_R2_FORCE_PATH_STYLE: booleanFromString.default(true),
    /** Public custom domain bound to the bucket, e.g. https://media.example.com */
    CLOUDFLARE_MEDIA_PUBLIC_URL: z.url().optional(),

    // --- Cloudflare cache purge ----------------------------------------------
    CLOUDFLARE_ZONE_ID: optionalString,
    CLOUDFLARE_API_TOKEN: optionalString,
    /** Tag and prefix purge are Enterprise-only; leave false to purge by URL. */
    CLOUDFLARE_PURGE_BY_TAG: booleanFromString.default(false),

    // --- Revalidation ---------------------------------------------------------
    REVALIDATION_SECRET: requiredString(16),

    // --- Redis ----------------------------------------------------------------
    REDIS_URL: optionalString,

    // --- Search ---------------------------------------------------------------
    SEARCH_PROVIDER: z.enum(SEARCH_PROVIDERS).default('postgres'),
    SEARCH_URL: z.url().optional(),
    SEARCH_API_KEY: optionalString,

    // --- Email ----------------------------------------------------------------
    EMAIL_FROM: z.email().optional(),
    SMTP_HOST: optionalString,
    SMTP_PORT: port.optional(),
    SMTP_USER: optionalString,
    SMTP_PASSWORD: optionalString,

    // --- Jobs / worker --------------------------------------------------------
    /**
     * Only the worker container sets this. Web replicas must leave it false, or
     * every replica races to publish the same scheduled article.
     */
    JOBS_RUN_IN_PROCESS: booleanFromString.default(false),
    JOBS_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).default(10_000),

    // --- Automated ingest -----------------------------------------------------
    /**
     * Off by default, and deliberately a separate switch from having the API key
     * present. The key gets set in every environment that might one day want it;
     * this is what decides whether a given deployment actually publishes
     * unattended, so staging can hold credentials without going live.
     */
    INGEST_ENABLED: booleanFromString.default(false),
    INGEST_SOURCE_URL: z.url().optional(),
    /** Stories taken from the feed per sweep. A backlog drains over later runs. */
    INGEST_MAX_PER_RUN: z.coerce.number().int().min(1).max(50).default(5),
    /**
     * How old a story may be and still be worth taking, in hours.
     *
     * The listing is a front page, so it carries yesterday's stories alongside
     * this morning's — and with a per-sweep cap, an old one taken is a new one
     * not taken. Publishing a day-old report as though it had just broken is
     * also its own problem: it arrives at the top of our front page, stamped
     * with the source's timestamp, above stories that are actually newer.
     *
     * Raise it to backfill deliberately; the dedupe makes that safe to do once
     * and put back.
     */
    INGEST_MAX_AGE_HOURS: z.coerce.number().int().min(1).max(720).default(24),
    OPENAI_API_KEY: optionalString,
    OPENAI_MODEL: z.string().trim().default('gpt-4o'),

    // --- Social auto-posting ---------------------------------------------------
    /**
     * Same shape as INGEST_ENABLED, for the same reason: the API key can sit in
     * every environment, and this switch alone decides which deployment
     * actually posts to the page. Staging holding real credentials must not
     * mean staging publishing photocards to the real audience.
     */
    SOCIAL_AUTOPOST_ENABLED: booleanFromString.default(false),
    UPLOAD_POST_API_KEY: optionalString,
    /** Profile name at upload-post.com that has the Facebook page connected. */
    UPLOAD_POST_PROFILE: optionalString,
    /** Optional when the profile has exactly one page connected or one pinned. */
    UPLOAD_POST_FACEBOOK_PAGE_ID: optionalString,

    // --- Observability --------------------------------------------------------
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
    ERROR_TRACKING_DSN: optionalString,
  })
  .superRefine((env, ctx) => {
    const isProduction = env.APP_ENV === 'production'

    const requireInProduction = (key: keyof typeof env, reason: string): void => {
      if (isProduction && !env[key]) {
        ctx.addIssue({ code: 'custom', path: [key], message: `Required in production — ${reason}` })
      }
    }

    // Local disk storage is never acceptable in production, so R2 must be complete.
    requireInProduction('CLOUDFLARE_R2_BUCKET', 'media must be stored in R2, never on disk')
    requireInProduction('CLOUDFLARE_R2_ACCESS_KEY_ID', 'R2 credentials incomplete')
    requireInProduction('CLOUDFLARE_R2_SECRET_ACCESS_KEY', 'R2 credentials incomplete')
    requireInProduction('CLOUDFLARE_R2_ENDPOINT', 'R2 credentials incomplete')
    requireInProduction('CLOUDFLARE_MEDIA_PUBLIC_URL', 'public media needs its own CDN hostname')

    /**
     * The ingest publishes without a human in the loop, so a half-configured
     * one must not start. Missing credentials would surface as a sweep that
     * fails every few minutes and fills the dead-letter table, which is a worse
     * way to learn about it than refusing to boot.
     */
    if (env.INGEST_ENABLED) {
      if (!env.OPENAI_API_KEY) {
        ctx.addIssue({
          code: 'custom',
          path: ['OPENAI_API_KEY'],
          message: 'Required when INGEST_ENABLED is true',
        })
      }
      if (!env.INGEST_SOURCE_URL) {
        ctx.addIssue({
          code: 'custom',
          path: ['INGEST_SOURCE_URL'],
          message: 'Required when INGEST_ENABLED is true',
        })
      }
    }

    /**
     * Same rule as the ingest: posting runs unattended, so a half-configured
     * setup must refuse to boot rather than dead-letter a job per publish.
     */
    if (env.SOCIAL_AUTOPOST_ENABLED) {
      if (!env.UPLOAD_POST_API_KEY) {
        ctx.addIssue({
          code: 'custom',
          path: ['UPLOAD_POST_API_KEY'],
          message: 'Required when SOCIAL_AUTOPOST_ENABLED is true',
        })
      }
      if (!env.UPLOAD_POST_PROFILE) {
        ctx.addIssue({
          code: 'custom',
          path: ['UPLOAD_POST_PROFILE'],
          message: 'Required when SOCIAL_AUTOPOST_ENABLED is true',
        })
      }
    }

    if (isProduction && env.DATABASE_PUSH) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_PUSH'],
        message: 'Refusing to enable destructive schema push in production — use migrations',
      })
    }

    if (isProduction && !env.DATABASE_SSL) {
      const localOnly = isLocalDatabaseHost(env.DATABASE_URI)
      if (!env.DATABASE_ALLOW_UNENCRYPTED) {
        ctx.addIssue({
          code: 'custom',
          path: ['DATABASE_SSL'],
          message: localOnly
            ? 'Database connections must be encrypted in production, or set DATABASE_ALLOW_UNENCRYPTED=true if Postgres is on this host and reachable only over the container network'
            : 'Database connections must be encrypted in production',
        })
      } else if (!localOnly) {
        ctx.addIssue({
          code: 'custom',
          path: ['DATABASE_ALLOW_UNENCRYPTED'],
          message:
            'DATABASE_ALLOW_UNENCRYPTED only applies to a database on this host; DATABASE_URI points somewhere else, so TLS is required',
        })
      }
    }

    if (env.DATABASE_POOL_MIN > env.DATABASE_POOL_MAX) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_POOL_MIN'],
        message: 'DATABASE_POOL_MIN cannot exceed DATABASE_POOL_MAX',
      })
    }

    if (env.SEARCH_PROVIDER !== 'postgres' && !env.SEARCH_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['SEARCH_URL'],
        message: `SEARCH_URL is required when SEARCH_PROVIDER is "${env.SEARCH_PROVIDER}"`,
      })
    }

    // A purge token without a zone (or vice versa) silently no-ops every purge.
    const hasZone = Boolean(env.CLOUDFLARE_ZONE_ID)
    const hasToken = Boolean(env.CLOUDFLARE_API_TOKEN)
    if (hasZone !== hasToken) {
      ctx.addIssue({
        code: 'custom',
        path: ['CLOUDFLARE_ZONE_ID'],
        message: 'CLOUDFLARE_ZONE_ID and CLOUDFLARE_API_TOKEN must be set together',
      })
    }
  })

export type ServerEnv = z.infer<typeof serverEnvSchema>
export type ClientEnv = z.infer<typeof clientEnvSchema>

export class EnvValidationError extends Error {
  public readonly issues: readonly string[]

  constructor(scope: 'server' | 'client', issues: readonly string[]) {
    super(
      `Invalid ${scope} environment configuration:\n` +
        issues.map((issue) => `  - ${issue}`).join('\n') +
        `\nSee .env.example and docs/environment.md.`,
    )
    this.name = 'EnvValidationError'
    this.issues = issues
  }
}

/** Formats issues as `KEY: message`. Values are never included. */
function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const key = issue.path.join('.') || '(root)'
    return `${key}: ${issue.message}`
  })
}

let cachedServerEnv: ServerEnv | undefined
let cachedClientEnv: ClientEnv | undefined

/**
 * Docker image builds run `next build` without production secrets available.
 * This escape hatch is for that step only — the running container still validates.
 */
function shouldSkipValidation(source: Readonly<Record<string, string | undefined>>): boolean {
  return source.SKIP_ENV_VALIDATION === 'true' || source.SKIP_ENV_VALIDATION === '1'
}

export function getServerEnv(
  source: Readonly<Record<string, string | undefined>> = process.env,
): ServerEnv {
  if (cachedServerEnv) return cachedServerEnv

  if (shouldSkipValidation(source)) {
    // Placeholders that satisfy the type without ever being usable as credentials.
    cachedServerEnv = serverEnvSchema.parse({
      NODE_ENV: 'development',
      APP_ENV: 'development',
      NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
      PAYLOAD_SECRET: 'build-time-placeholder-not-a-real-secret',
      DATABASE_URI: 'postgres://build:build@localhost:5432/build',
      REVALIDATION_SECRET: 'build-time-placeholder',
    })
    return cachedServerEnv
  }

  const parsed = serverEnvSchema.safeParse(stripEmptyValues(source))
  if (!parsed.success) throw new EnvValidationError('server', formatIssues(parsed.error))

  cachedServerEnv = parsed.data
  return cachedServerEnv
}

export function getClientEnv(
  source: Readonly<Record<string, string | undefined>> = process.env,
): ClientEnv {
  if (cachedClientEnv) return cachedClientEnv

  // Next inlines NEXT_PUBLIC_* at build time, so these must be read literally
  // rather than through a dynamic index, or the values disappear in the bundle.
  const parsed = clientEnvSchema.safeParse(
    stripEmptyValues({
      NEXT_PUBLIC_SITE_URL: source.NEXT_PUBLIC_SITE_URL,
      NEXT_PUBLIC_MEDIA_URL: source.NEXT_PUBLIC_MEDIA_URL,
      NEXT_PUBLIC_IMAGE_CDN: source.NEXT_PUBLIC_IMAGE_CDN,
      NEXT_PUBLIC_DEFAULT_LOCALE: source.NEXT_PUBLIC_DEFAULT_LOCALE,
      NEXT_PUBLIC_APP_VERSION: source.NEXT_PUBLIC_APP_VERSION,
      NEXT_PUBLIC_GA_ID: source.NEXT_PUBLIC_GA_ID,
    }),
  )
  if (!parsed.success) throw new EnvValidationError('client', formatIssues(parsed.error))

  cachedClientEnv = parsed.data
  return cachedClientEnv
}

/** Test-only: clears memoised env so a suite can assert on different inputs. */
export function resetEnvCache(): void {
  cachedServerEnv = undefined
  cachedClientEnv = undefined
}
