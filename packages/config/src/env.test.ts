import { beforeEach, describe, expect, it } from 'vitest'
import { EnvValidationError, getServerEnv, resetEnvCache } from './env.js'

const SECRET = 'a'.repeat(48)

/** Smallest environment that should validate for local development. */
function baseEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    APP_ENV: 'development',
    NODE_ENV: 'development',
    NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
    PAYLOAD_SECRET: SECRET,
    DATABASE_URI: 'postgres://user:pw@localhost:5432/db',
    REVALIDATION_SECRET: 'revalidation-secret-value',
    ...overrides,
  }
}

function expectIssues(source: Record<string, string | undefined>): string[] {
  try {
    getServerEnv(source)
  } catch (error) {
    if (error instanceof EnvValidationError) return [...error.issues]
    throw error
  }
  throw new Error('Expected environment validation to fail, but it succeeded')
}

beforeEach(() => {
  resetEnvCache()
})

describe('getServerEnv', () => {
  it('accepts a minimal development environment and applies defaults', () => {
    const env = getServerEnv(baseEnv())
    expect(env.APP_ENV).toBe('development')
    expect(env.DATABASE_POOL_MIN).toBe(2)
    expect(env.DATABASE_POOL_MAX).toBe(10)
    expect(env.SEARCH_PROVIDER).toBe('postgres')
    expect(env.JOBS_RUN_IN_PROCESS).toBe(false)
  })

  it('memoises so repeated reads do not re-validate', () => {
    const first = getServerEnv(baseEnv())
    const second = getServerEnv(baseEnv({ DATABASE_POOL_MAX: '99' }))
    expect(second).toBe(first)
  })

  it('reports every missing key at once rather than failing on the first', () => {
    const issues = expectIssues({ APP_ENV: 'development' })
    expect(issues.join('\n')).toContain('NEXT_PUBLIC_SITE_URL')
    expect(issues.join('\n')).toContain('PAYLOAD_SECRET')
    expect(issues.join('\n')).toContain('DATABASE_URI')
    expect(issues.join('\n')).toContain('REVALIDATION_SECRET')
  })

  it('never includes the offending value in the error message', () => {
    const secret = 'super-secret-value-that-is-far-too-short'
    const issues = expectIssues(baseEnv({ PAYLOAD_SECRET: 'short', DATABASE_URI: secret }))
    const message = issues.join('\n')
    expect(message).toContain('PAYLOAD_SECRET')
    expect(message).not.toContain('short')
    expect(message).not.toContain(secret)
  })

  it('rejects a PAYLOAD_SECRET below the 32-character floor', () => {
    expect(expectIssues(baseEnv({ PAYLOAD_SECRET: 'a'.repeat(31) })).join()).toContain(
      'PAYLOAD_SECRET',
    )
  })

  it('treats empty strings as absent rather than as invalid values', () => {
    const env = getServerEnv(
      baseEnv({
        CLOUDFLARE_R2_ENDPOINT: '',
        CLOUDFLARE_MEDIA_PUBLIC_URL: '',
        SEARCH_URL: '',
        SMTP_HOST: '   ',
      }),
    )
    expect(env.CLOUDFLARE_R2_ENDPOINT).toBeUndefined()
    expect(env.SMTP_HOST).toBeUndefined()
  })

  it('rejects a pool minimum above the maximum', () => {
    expect(
      expectIssues(baseEnv({ DATABASE_POOL_MIN: '20', DATABASE_POOL_MAX: '5' })).join(),
    ).toContain('DATABASE_POOL_MIN')
  })

  it('requires a Cloudflare zone and token to be set together', () => {
    expect(expectIssues(baseEnv({ CLOUDFLARE_ZONE_ID: 'zone-id' })).join()).toContain(
      'CLOUDFLARE_ZONE_ID',
    )
    resetEnvCache()
    expect(expectIssues(baseEnv({ CLOUDFLARE_API_TOKEN: 'token' })).join()).toContain(
      'CLOUDFLARE_ZONE_ID',
    )
  })

  it('requires SEARCH_URL when the provider is not postgres', () => {
    expect(expectIssues(baseEnv({ SEARCH_PROVIDER: 'meilisearch' })).join()).toContain('SEARCH_URL')
  })

  it('does not apply production rules to a production NODE_ENV alone', () => {
    // `next build` forces NODE_ENV=production; that must not fail a dev build.
    const env = getServerEnv(baseEnv({ NODE_ENV: 'production', APP_ENV: 'development' }))
    expect(env.NODE_ENV).toBe('production')
    expect(env.APP_ENV).toBe('development')
  })
})

describe('production safety rules', () => {
  const productionBase = () =>
    baseEnv({
      APP_ENV: 'production',
      NODE_ENV: 'production',
      NEXT_PUBLIC_SITE_URL: 'https://example.com',
      DATABASE_SSL: 'true',
      DATABASE_PUSH: 'false',
      CLOUDFLARE_R2_BUCKET: 'media',
      CLOUDFLARE_R2_ACCESS_KEY_ID: 'key',
      CLOUDFLARE_R2_SECRET_ACCESS_KEY: 'secret',
      CLOUDFLARE_R2_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
      CLOUDFLARE_MEDIA_PUBLIC_URL: 'https://media.example.com',
    })

  it('accepts a complete production environment', () => {
    const env = getServerEnv(productionBase())
    expect(env.APP_ENV).toBe('production')
    expect(env.DATABASE_SSL).toBe(true)
  })

  it('refuses to start without R2 configured', () => {
    const issues = expectIssues({
      ...productionBase(),
      CLOUDFLARE_R2_BUCKET: '',
      CLOUDFLARE_R2_ENDPOINT: '',
    }).join('\n')
    expect(issues).toContain('CLOUDFLARE_R2_BUCKET')
    expect(issues).toContain('CLOUDFLARE_R2_ENDPOINT')
  })

  it('refuses destructive schema push in production', () => {
    const source = { ...productionBase(), DATABASE_PUSH: 'true' }
    expect(expectIssues(source).join()).toContain('DATABASE_PUSH')
  })

  it('requires encrypted database connections in production', () => {
    const source = { ...productionBase(), DATABASE_SSL: 'false' }
    expect(expectIssues(source).join()).toContain('DATABASE_SSL')
  })
})
