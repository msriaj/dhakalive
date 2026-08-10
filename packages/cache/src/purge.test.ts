import { describe, expect, it, vi } from 'vitest'

import { createCloudflarePurger, noopPurger } from './purge.js'

interface Captured {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

function recordingFetch(status = 200) {
  const calls: Captured[] = []
  const impl = vi.fn((url: string, init?: RequestInit) => {
    const body = typeof init?.body === 'string' ? init.body : '{}'
    calls.push({
      url,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: JSON.parse(body) as Record<string, unknown>,
    })
    return Promise.resolve(new Response(null, { status }))
  })
  return { calls, impl: impl as unknown as typeof fetch }
}

const baseConfig = {
  zoneId: 'zone-123',
  apiToken: 'token-abc',
  siteUrl: 'https://example.com',
}

describe('URL purging', () => {
  it('turns paths into absolute URLs on the configured origin', async () => {
    const { calls, impl } = recordingFetch()
    const purger = createCloudflarePurger({ ...baseConfig, fetchImpl: impl })

    const result = await purger.purge({ paths: ['/bn', '/bn/politics'], tags: ['home:bn'] })

    expect(result.ok).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.body.files).toEqual([
      'https://example.com/bn',
      'https://example.com/bn/politics',
    ])
  })

  it('sends the token as a bearer header and targets the right zone', async () => {
    const { calls, impl } = recordingFetch()
    const purger = createCloudflarePurger({ ...baseConfig, fetchImpl: impl })
    await purger.purge({ paths: ['/bn'], tags: [] })

    expect(calls[0]?.url).toBe('https://api.cloudflare.com/client/v4/zones/zone-123/purge_cache')
    expect(calls[0]?.headers.authorization).toBe('Bearer token-abc')
  })

  it('batches beyond Cloudflare 30-URL limit', async () => {
    const { calls, impl } = recordingFetch()
    const purger = createCloudflarePurger({ ...baseConfig, fetchImpl: impl })

    const paths = Array.from({ length: 65 }, (_, index) => `/bn/article-${index}`)
    const result = await purger.purge({ paths, tags: [] })

    expect(result.requests).toBe(3)
    expect(result.submitted).toBe(65)
    expect(calls).toHaveLength(3)
    expect((calls[0]?.body.files as string[]).length).toBe(30)
    expect((calls[2]?.body.files as string[]).length).toBe(5)
  })

  it('ignores tags when tag purging is off', async () => {
    const { calls, impl } = recordingFetch()
    const purger = createCloudflarePurger({ ...baseConfig, fetchImpl: impl })
    await purger.purge({ paths: ['/bn'], tags: ['home:bn', 'layout:bn'] })

    expect(calls[0]?.body.tags).toBeUndefined()
  })

  it('makes no request when there is nothing to purge', async () => {
    const { calls, impl } = recordingFetch()
    const purger = createCloudflarePurger({ ...baseConfig, fetchImpl: impl })

    const result = await purger.purge({ paths: [], tags: [] })
    expect(result).toEqual({ ok: true, submitted: 0, requests: 0, errors: [] })
    expect(calls).toHaveLength(0)
  })
})

describe('tag purging', () => {
  it('sends tags in one request when enabled', async () => {
    const { calls, impl } = recordingFetch()
    const purger = createCloudflarePurger({ ...baseConfig, purgeByTag: true, fetchImpl: impl })

    const result = await purger.purge({ paths: ['/bn'], tags: ['home:bn', 'layout:bn'] })

    expect(result.requests).toBe(1)
    expect(calls[0]?.body.tags).toEqual(['home:bn', 'layout:bn'])
    expect(calls[0]?.body.files).toBeUndefined()
  })
})

describe('failure handling', () => {
  it('reports a failed status without leaking the response body', async () => {
    const { impl } = recordingFetch(403)
    const purger = createCloudflarePurger({ ...baseConfig, fetchImpl: impl })

    const result = await purger.purge({ paths: ['/bn'], tags: [] })

    expect(result.ok).toBe(false)
    expect(result.errors[0]).toContain('403')
    // The API token must never end up in a log line.
    expect(result.errors.join()).not.toContain('token-abc')
  })

  it('survives a network error rather than throwing', async () => {
    const impl = vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))) as unknown as typeof fetch
    const purger = createCloudflarePurger({ ...baseConfig, fetchImpl: impl })

    const result = await purger.purge({ paths: ['/bn'], tags: [] })
    expect(result.ok).toBe(false)
    expect(result.errors).toHaveLength(1)
  })

  it('reports partial failure across batches', async () => {
    let call = 0
    const impl = vi.fn(() => {
      call += 1
      return Promise.resolve(new Response(null, { status: call === 2 ? 500 : 200 }))
    }) as unknown as typeof fetch

    const purger = createCloudflarePurger({ ...baseConfig, fetchImpl: impl })
    const paths = Array.from({ length: 45 }, (_, index) => `/bn/a-${index}`)

    const result = await purger.purge({ paths, tags: [] })
    expect(result.ok).toBe(false)
    expect(result.requests).toBe(2)
    expect(result.errors).toHaveLength(1)
  })
})

describe('noopPurger', () => {
  it('succeeds without doing anything, for unconfigured environments', async () => {
    const result = await noopPurger.purge({ paths: ['/bn'], tags: ['home:bn'] })
    expect(result).toEqual({ ok: true, submitted: 0, requests: 0, errors: [] })
  })
})
