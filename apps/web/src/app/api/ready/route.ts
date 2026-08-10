import config from '@payload-config'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import { correlationIdFromHeaders, getLogger } from '@dhakalive/observability'

/**
 * Readiness probe. Unlike /api/health this touches the database, so a load
 * balancer stops routing traffic to an instance that cannot serve real requests.
 */
export const dynamic = 'force-dynamic'

interface CheckResult {
  name: string
  ok: boolean
  durationMs: number
}

async function checkDatabase(): Promise<CheckResult> {
  const startedAt = performance.now()
  try {
    const payload = await getPayload({ config })
    await payload.count({ collection: 'users' })
    return { name: 'postgres', ok: true, durationMs: Math.round(performance.now() - startedAt) }
  } catch {
    return { name: 'postgres', ok: false, durationMs: Math.round(performance.now() - startedAt) }
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  const correlationId = correlationIdFromHeaders(request.headers)
  const checks = [await checkDatabase()]
  const ok = checks.every((check) => check.ok)

  if (!ok) {
    // The reason is logged, never returned — a probe response is unauthenticated
    // and must not leak connection strings or driver internals.
    getLogger().error({ correlationId, checks }, 'Readiness check failed')
  }

  return NextResponse.json(
    {
      status: ok ? 'ready' : 'not-ready',
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev',
      checks,
    },
    {
      status: ok ? 200 : 503,
      headers: { 'cache-control': 'no-store', 'x-correlation-id': correlationId },
    },
  )
}
