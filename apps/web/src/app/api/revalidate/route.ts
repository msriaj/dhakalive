import { timingSafeEqual } from 'node:crypto'

import { NextResponse } from 'next/server'

import { isLocale } from '@dhakalive/config'
import { correlationIdFromHeaders, getLogger } from '@dhakalive/observability'

import { env } from '../../../lib/env'
import { revalidateFor } from '../../../lib/cache/revalidation-service'

/**
 * On-demand revalidation.
 *
 * Exists for operators and for the background worker: publishing through the
 * CMS already revalidates through collection hooks, so this is the manual and
 * out-of-process path — "the CDN is serving something stale, clear it".
 *
 * Deliberately narrow. It accepts a described *event*, not a list of paths, so
 * a caller cannot ask the site to purge arbitrary URLs; the target set is still
 * computed by the same pure function every other caller uses.
 */
export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 8 * 1024

/**
 * Constant-time comparison. A plain `===` leaks the shared secret one character
 * at a time to anyone who can measure response timing.
 */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false

  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  // timingSafeEqual throws on length mismatch, which would itself be a signal.
  if (a.length !== b.length) {
    timingSafeEqual(a, a)
    return false
  }
  return timingSafeEqual(a, b)
}

export async function POST(request: Request): Promise<NextResponse> {
  const correlationId = correlationIdFromHeaders(request.headers)
  const logger = getLogger()
  const serverEnv = env()

  const headers = { 'cache-control': 'no-store', 'x-correlation-id': correlationId }

  if (!secretMatches(request.headers.get('x-revalidation-secret'), serverEnv.REVALIDATION_SECRET)) {
    // No detail: a caller without the secret learns nothing about what exists.
    logger.warn({ correlationId }, 'Revalidation rejected: bad secret')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
  }

  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413, headers })
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers })
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400, headers })
  }

  const candidate = body as { type?: unknown; locale?: unknown }
  if (!isLocale(candidate.locale)) {
    return NextResponse.json({ error: 'Unknown locale' }, { status: 400, headers })
  }

  /**
   * Only whole-locale invalidation is exposed. Per-document events come from
   * the collection hooks, which have the document to hand; accepting arbitrary
   * ids here would mean trusting the caller's view of what changed.
   */
  if (candidate.type !== 'locale') {
    return NextResponse.json(
      { error: 'Unsupported type. Only "locale" is accepted.' },
      { status: 400, headers },
    )
  }

  const outcome = await revalidateFor({
    type: 'global',
    locale: candidate.locale,
    global: 'site-settings',
  })

  logger.info(
    { correlationId, paths: outcome.targets.paths.length, errors: outcome.errors.length },
    'Manual revalidation performed',
  )

  return NextResponse.json(
    {
      revalidated: true,
      locale: candidate.locale,
      paths: outcome.targets.paths.length,
      purged: outcome.purged,
      errors: outcome.errors,
    },
    { headers },
  )
}

/** Anything other than POST is refused, including cache-warming GETs. */
export function GET(): NextResponse {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405, headers: { 'cache-control': 'no-store', allow: 'POST' } },
  )
}
