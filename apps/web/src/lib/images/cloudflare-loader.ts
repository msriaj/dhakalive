/**
 * next/image loader that hands resizing to Cloudflare instead of the origin.
 *
 * The optimiser that ships with Next runs sharp inside the web container, on
 * the request path. Measured against production, a cold encode cost 0.9-1.3s
 * as WebP and 1.9-3.8s as AVIF, and while sharp held the CPU the React render
 * slowed with it — article TTFB went from 97ms idle to 3.6s under a burst of
 * encodes. On a news site with continuous ingest that load never really stops.
 *
 * Cloudflare's `/cdn-cgi/image/` transformations do the same work at the edge,
 * close to the reader, with the result cached per variant. That removes the
 * CPU cost from the origin entirely *and* allows `format=auto` — Cloudflare
 * picks AVIF for browsers that accept it and WebP for the rest, so the smaller
 * format costs us nothing. Our own optimiser could not do that: AVIF's encode
 * time was exactly why we stopped serving it.
 *
 * @see https://developers.cloudflare.com/images/transform-images/
 */

/**
 * Cloudflare transformations are a billed, per-zone feature and are off until
 * someone enables them in the dashboard. Requesting `/cdn-cgi/image/` on a zone
 * without them returns 404 — every image on the site, broken — so this is opt
 * in rather than inferred from the media URL being a Cloudflare domain.
 *
 * Read as a literal rather than through `getClientEnv()`: this module is
 * bundled for the browser and Next only inlines `NEXT_PUBLIC_*` when it can see
 * the property access statically.
 */
const CDN_ENABLED = process.env.NEXT_PUBLIC_IMAGE_CDN === 'cloudflare'

const MEDIA_URL = process.env.NEXT_PUBLIC_MEDIA_URL

/** next/image's own default, applied when a call site does not set one. */
const DEFAULT_QUALITY = 75

export interface ImageLoaderArgs {
  src: string
  width: number
  quality?: number
}

/**
 * What to serve when Cloudflare cannot resize a given source.
 *
 * It returns the original file, unresized, and that is forced rather than
 * chosen. The obvious fallback would be `/_next/image` — but configuring a
 * custom loader *removes* that route: on a standalone build every request to it
 * 404s once `loader: 'custom'` is set. So inside this file the built-in
 * optimiser does not exist, and the only honest options are the original bytes
 * or a broken image.
 *
 * That is survivable because this file is only loaded at all when the CDN is
 * switched on, which is production, where every image lives on the media
 * domain and takes the fast path. The cases that land here are development's
 * relative upload paths and the occasional third-party URL — correctness
 * preserved, optimisation lost, nothing broken.
 *
 * next.config.ts is what keeps the flag-off path safe: it does not install this
 * loader at all, so `/_next/image` survives untouched.
 */
function unoptimised({ src }: ImageLoaderArgs): string {
  return src
}

/**
 * True when `src` is a file we serve from the media domain.
 *
 * Transformations only apply to a zone Cloudflare is proxying, so an image from
 * anywhere else — a relative path in development, where Payload serves uploads
 * from the app's own origin, or a third-party URL — has to go the long way.
 */
function isOnMediaHost(src: string): boolean {
  if (!MEDIA_URL) return false
  try {
    return new URL(src).origin === new URL(MEDIA_URL).origin
  } catch {
    // Relative paths land here. They are the app's own origin, not the media
    // domain, so they are correctly excluded.
    return false
  }
}

export default function cloudflareImageLoader(args: ImageLoaderArgs): string {
  if (!CDN_ENABLED || !isOnMediaHost(args.src)) return unoptimised(args)

  const { pathname, search } = new URL(args.src)
  const quality = args.quality ?? DEFAULT_QUALITY

  /**
   * `fit=scale-down` matches what the built-in optimiser does: never enlarge a
   * source beyond its own dimensions. Without it Cloudflare would happily
   * upscale a 1200px photograph to a 1920px request and bill for a variant that
   * carries no more detail than the original.
   */
  const options = `width=${args.width},quality=${quality},format=auto,fit=scale-down`

  // The source is given as a path, not a full URL, so the transformation is
  // served from the media zone itself and inherits its cache rules.
  return `${new URL(MEDIA_URL!).origin}/cdn-cgi/image/${options}${pathname}${search}`
}
