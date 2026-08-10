import config from '@payload-config'
import {
  REST_DELETE,
  REST_GET,
  REST_OPTIONS,
  REST_PATCH,
  REST_POST,
  REST_PUT,
} from '@payloadcms/next/routes'

/**
 * Payload's REST surface. Every response here is either authenticated or
 * derived from access control, so it must never be cached by a shared cache.
 * The Cloudflare cache rule for /api/* is set to bypass, and `force-dynamic`
 * stops Next from producing a static shell for any of it.
 */
export const dynamic = 'force-dynamic'

export const GET = REST_GET(config)
export const POST = REST_POST(config)
export const DELETE = REST_DELETE(config)
export const PATCH = REST_PATCH(config)
export const PUT = REST_PUT(config)
export const OPTIONS = REST_OPTIONS(config)
