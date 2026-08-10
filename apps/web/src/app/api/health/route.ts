import { NextResponse } from 'next/server'

/**
 * Liveness probe. Deliberately does no I/O: it answers "is this process able to
 * serve HTTP", nothing else. Checking the database here would make a brief
 * Postgres blip restart every healthy web container.
 */
export const dynamic = 'force-dynamic'

export function GET(): NextResponse {
  return NextResponse.json(
    {
      status: 'ok',
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev',
      uptimeSeconds: Math.round(process.uptime()),
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}
