import { timingSafeEqual } from 'node:crypto'

import { NextResponse } from 'next/server'

import { isLocale } from '@dhakalive/config'
import { parseRevalidationEvent } from '@dhakalive/core'
import { correlationIdFromHeaders, getLogger } from '@dhakalive/observability'

import { env } from '../../../lib/env'
import { revalidateFor } from '../../../lib/cache/revalidation-service'

/**
 * On-demand revalidation.
 *
 * Exists for operators and, more importantly, for the background worker.
 * `revalidatePath` only works inside a Next request scope, so a change made by
 * the worker — a scheduled article going live — cannot clear the origin's route
 * cache from where it happens. The `revalidate` job posts the change here
 * instead, and this handler performs it inside a real request.
 *
 * Deliberately narrow in the one way that matters: it accepts a described
 * *event*, never a list of paths. The targets are computed by the same pure
 * function every in-process caller uses, so possession of the shared secret
 * does not confer the ability to purge arbitrary URLs, and no caller can invent
 * a purge set that a real edit would not have produced.
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
   * `locale` is the operator's blunt instrument — "clear this locale" — and is
   * kept because it is what a human reaches for at 3am. Everything else must be
   * a real event, validated field by field, because the caller is the worker
   * and its input is data from another process.
   */
  const event =
    candidate.type === 'locale'
      ? ({ type: 'global', locale: candidate.locale, global: 'site-settings' } as const)
      : parseRevalidationEvent(body)

  if (!event) {
    // No detail about *which* field was wrong: the caller is our own worker, so
    // a validation error is a bug to be read in our logs, not a hint to give out.
    logger.warn({ correlationId, type: candidate.type }, 'Revalidation rejected: malformed event')
    return NextResponse.json({ error: 'Unsupported or malformed event' }, { status: 400, headers })
  }

  const outcome = await revalidateFor(event)

  logger.info(
    {
      correlationId,
      type: event.type,
      locale: event.locale,
      paths: outcome.targets.paths.length,
      errors: outcome.errors.length,
    },
    'Out-of-request revalidation performed',
  )

  /**
   * A revalidation that partly failed is reported as a failure. The caller is a
   * job with retries, and answering 200 to "the CDN purge was rejected" would
   * convert a recoverable error into a permanently stale page.
   */
  const status = outcome.errors.length > 0 ? 502 : 200

  return NextResponse.json(
    {
      revalidated: outcome.errors.length === 0,
      locale: event.locale,
      paths: outcome.targets.paths.length,
      purged: outcome.purged,
      errors: outcome.errors,
    },
    { status, headers },
  )
}

/** Anything other than POST is refused, including cache-warming GETs. */
export function GET(): NextResponse {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405, headers: { 'cache-control': 'no-store', allow: 'POST' } },
  )
}
