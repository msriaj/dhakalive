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
 * The unset case, which is the one that actually runs in production — the
 * deployed `.env` does not set this variable.
 *
 * next.config.ts installs this loader for anything that is not the literal
 * `next`, and this file has to agree. When it did not, the loader was installed
 * (deleting `/_next/image`) and then returned every source untouched: full-size
 * originals at every srcset width, and no route left to fall back to. These
 * cases pin both halves of that condition.
 */
describe('default, with nothing configured', () => {
  it('uses the CDN, matching what next.config installs the loader for', async () => {
    const loader = await loadWith({ NEXT_PUBLIC_MEDIA_URL: MEDIA })
    expect(loader(hero)).toContain('/cdn-cgi/image/')
  })

  it('never returns the unresized original', async () => {
    const loader = await loadWith({ NEXT_PUBLIC_MEDIA_URL: MEDIA })
    expect(loader(hero)).not.toBe(hero.src)
  })

  /** An unrecognised value is not a reason to silently stop resizing. */
  it('treats an unrecognised value as the CDN', async () => {
    const loader = await loadWith({ NEXT_PUBLIC_IMAGE_CDN: 'true', NEXT_PUBLIC_MEDIA_URL: MEDIA })
    expect(loader(hero)).toContain('/cdn-cgi/image/')
  })
})

/**
 * `next` is the rollback, and it is the only value that turns the CDN off.
 *
 * Reaching this branch in production would mean next.config had also left the
 * built-in optimiser in place, so the passthrough here is the misconfiguration
 * path, not the normal one: it keeps images loading rather than breaking them.
 */
describe('with the CDN explicitly disabled', () => {
  it('passes the source through untouched', async () => {
    const loader = await loadWith({ NEXT_PUBLIC_IMAGE_CDN: 'next', NEXT_PUBLIC_MEDIA_URL: MEDIA })
    expect(loader(hero)).toBe(hero.src)
  })

  /** Never a relative or malformed URL: the browser has to be able to load it. */
  it('returns something the browser can fetch', async () => {
    const loader = await loadWith({ NEXT_PUBLIC_IMAGE_CDN: 'next', NEXT_PUBLIC_MEDIA_URL: MEDIA })
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

  /** The same guard on the default path, where no variable is set at all. */
  it('falls back when nothing is configured at all', async () => {
    const loader = await loadWith({})
    expect(loader(hero)).toBe(hero.src)
    expect(loader(hero)).not.toContain('undefined')
  })
})
