import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ImageLoaderArgs } from './cloudflare-loader'

/**
 * The loader reads its flag at module scope, because Next only inlines
 * `NEXT_PUBLIC_*` into the browser bundle when it can see the property access
 * statically. That means each case has to re-import the module after setting
 * the environment rather than calling a function with different arguments.
 */
async function loadWith(env: Record<string, string | undefined>) {
  vi.resetModules()
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) vi.stubEnv(key, '')
    else vi.stubEnv(key, value)
  }
  const loaded = await import('./cloudflare-loader')
  return loaded.default
}

const MEDIA = 'https://media.dhakalive.com'
const ON_CDN = { NEXT_PUBLIC_IMAGE_CDN: 'cloudflare', NEXT_PUBLIC_MEDIA_URL: MEDIA }

const hero: ImageLoaderArgs = { src: `${MEDIA}/3985055.webp`, width: 1080 }

beforeEach(() => {
  vi.unstubAllEnvs()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

/**
 * "Disabled" here means the loader was installed but the flag is off — a
 * misconfiguration, not the normal off state. Normally next.config.ts does not
 * install this file at all and `/_next/image` handles everything, which is
 * exactly why the fallback cannot point at that route: configuring a custom
 * loader deletes it.
 */
describe('with the CDN disabled', () => {
  it('passes the source through untouched', async () => {
    const loader = await loadWith({ NEXT_PUBLIC_MEDIA_URL: MEDIA })
    expect(loader(hero)).toBe(hero.src)
  })

  it('stays disabled for any value other than "cloudflare"', async () => {
    const loader = await loadWith({ NEXT_PUBLIC_IMAGE_CDN: 'true', NEXT_PUBLIC_MEDIA_URL: MEDIA })
    expect(loader(hero)).toBe(hero.src)
  })

  /** Never a relative or malformed URL: the browser has to be able to load it. */
  it('returns something the browser can fetch', async () => {
    const loader = await loadWith({ NEXT_PUBLIC_MEDIA_URL: MEDIA })
    expect(() => new URL(loader(hero))).not.toThrow()
  })
})

describe('with the CDN enabled', () => {
  it('rewrites a media-domain image to a transformation URL', async () => {
    const loader = await loadWith(ON_CDN)
    expect(loader(hero)).toBe(
      `${MEDIA}/cdn-cgi/image/width=1080,quality=60,format=auto,fit=scale-down/3985055.webp`,
    )
  })

  /**
   * Cloudflare's quality scale is not sharp's: passing next/image's 75 through
   * measured *larger* than the WebP the built-in optimiser produced at its own
   * 75, which would have made the migration a byte regression.
   */
  it('defaults to the Cloudflare-tuned quality rather than next/image default', async () => {
    const loader = await loadWith(ON_CDN)
    expect(loader(hero)).toContain('quality=60')
  })

  it('honours an explicit quality when a call site sets one', async () => {
    const loader = await loadWith(ON_CDN)
    expect(loader({ ...hero, quality: 45 })).toContain('quality=45')
  })

  /**
   * `format=auto` is the whole point of moving to the edge: Cloudflare serves
   * AVIF to browsers that accept it and WebP to the rest, without the origin
   * paying AVIF's encode time. Losing this option would silently give up the
   * byte saving the migration was for.
   */
  it('always requests format=auto', async () => {
    const loader = await loadWith(ON_CDN)
    expect(loader(hero)).toContain('format=auto')
  })

  /** Cloudflare bills per variant, and an upscale is a variant with no new detail. */
  it('never upscales', async () => {
    const loader = await loadWith(ON_CDN)
    expect(loader({ ...hero, width: 3840 })).toContain('fit=scale-down')
  })

  it('preserves a query string on the source', async () => {
    const loader = await loadWith(ON_CDN)
    expect(loader({ ...hero, src: `${MEDIA}/a.webp?v=2` })).toMatch(/\/a\.webp\?v=2$/)
  })

  /**
   * Transformations only work on a zone Cloudflare proxies. Development serves
   * Payload uploads from the app's own origin as relative paths, and those must
   * keep working or every image 404s the moment the flag is on in a branch
   * preview.
   */
  it('leaves a relative path unresized rather than breaking it', async () => {
    const loader = await loadWith(ON_CDN)
    expect(loader({ ...hero, src: '/api/media/file/local.png' })).toBe('/api/media/file/local.png')
  })

  it('leaves a third-party host unresized', async () => {
    const loader = await loadWith(ON_CDN)
    expect(loader({ ...hero, src: 'https://example.com/a.png' })).toBe('https://example.com/a.png')
  })

  /**
   * A half-configured environment — flag on, media URL missing — must degrade
   * to the working path rather than building `undefined/cdn-cgi/...`.
   */
  it('falls back when the media URL is unset', async () => {
    const loader = await loadWith({ NEXT_PUBLIC_IMAGE_CDN: 'cloudflare' })
    expect(loader(hero)).toBe(hero.src)
    expect(loader(hero)).not.toContain('undefined')
  })
})
