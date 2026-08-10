import NextImage from 'next/image'

import type { Media } from '../payload-types'

/** Payload's own upload route, used whenever media is not offloaded to R2. */
const LOCAL_UPLOAD_PATH = /^\/api\/[^/]+\/file\//

/**
 * Rewrites a self-hosted media URL to a relative path.
 *
 * Payload builds absolute URLs from `serverURL`, so with no R2 configured —
 * development, and any environment before storage is wired — every image looks
 * *remote* to next/image and is rejected by its allowlist with a 400. Our own
 * media is not remote.
 *
 * Matched on Payload's upload path rather than on an environment variable:
 * `NEXT_PUBLIC_*` values are inlined at build time and are not reliably present
 * when this renders. R2 URLs are served from the media domain under a `media/`
 * prefix, so they never match this pattern and stay absolute.
 */
function toOptimisableSrc(url: string): string {
  try {
    // The base only matters for parsing; a relative input keeps its own path.
    const parsed = new URL(url, 'http://internal.invalid')
    return LOCAL_UPLOAD_PATH.test(parsed.pathname) ? `${parsed.pathname}${parsed.search}` : url
  } catch {
    return url
  }
}

/**
 * Renders an uploaded image.
 *
 * Returns null rather than an empty box when the relationship is unpopulated or
 * the asset has no URL — a broken image element is worse than no image.
 *
 * Alt text falls back to an empty string, which is the correct value for a
 * decorative image. Articles cannot reach that state: the publish guard refuses
 * a featured image without alt text.
 */
export function MediaImage({
  media,
  sizes,
  priority = false,
  className,
  fill = false,
  width,
  height,
}: {
  media: unknown
  sizes?: string
  priority?: boolean
  className?: string
  fill?: boolean
  width?: number
  height?: number
}) {
  if (!media || typeof media !== 'object') return null

  const asset = media as Media
  if (!asset.url) return null

  const alt = typeof asset.alt === 'string' ? asset.alt : ''
  const src = toOptimisableSrc(asset.url)

  if (fill) {
    return (
      <NextImage
        src={src}
        alt={alt}
        fill
        sizes={sizes ?? '100vw'}
        priority={priority}
        className={className}
      />
    )
  }

  return (
    <NextImage
      src={src}
      alt={alt}
      width={width ?? asset.width ?? 1200}
      height={height ?? asset.height ?? 675}
      sizes={sizes}
      priority={priority}
      className={className}
    />
  )
}
