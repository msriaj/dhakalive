import { NextResponse } from 'next/server'

import { getLogger } from '@dhakalive/observability'

import { recordView } from '../../../lib/queries/views'

/**
 * Records that a reader opened an article.
 *
 * A POST from the page rather than a count taken during the render, because the
 * render is cached: an article is generated once and served to everybody from
 * the CDN, so incrementing a counter there would count regenerations, not
 * readers. This is the only moment the origin hears from each reader
 * individually.
 *
 * ## What this number is, and is not
 *
 * It is an ordering signal for "most read", counted once per article per
 * browser session, from browsers that run JavaScript and same-origin requests
 * only. It is not analytics and must not be presented as a readership figure:
 * nothing here defeats a determined script, and nothing here sees a reader who
 * blocks the request. Ordering degrades gracefully under both — a story with
 * inflated counts sorts too high, which is a bad list, not bad data elsewhere.
 *
 * Deliberately unauthenticated. A shared secret in a page served to the public
 * is not a secret, and the alternative — no count at all — is worse than an
 * approximate one.
 */
export const dynamic = 'force-dynamic'

/** Same-origin only, which is what a browser will send from our own pages. */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return true // `sendBeacon` from same-origin omits it in some browsers.

  try {
    return new URL(origin).host === new URL(request.url).host
  } catch {
    return false
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const headers = { 'cache-control': 'no-store' }

  if (!sameOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers })
  }

  let id: unknown
  try {
    const body: unknown = await request.json()
    id = (body as { id?: unknown } | null)?.id
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400, headers })
  }

  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400, headers })
  }

  try {
    await recordView(id)
  } catch (error) {
    /*
     * Logged, never surfaced. The reader is already reading the story; a failed
     * counter is our problem and telling them about it — or worse, letting the
     * failure reach their console — is noise about something they did not ask
     * for. The response is 204 either way so that a caller cannot use this
     * endpoint to discover which ids exist.
     */
    getLogger().warn(
      { articleId: id, err: error instanceof Error ? error.message : String(error) },
      'View could not be recorded',
    )
  }

  return new NextResponse(null, { status: 204, headers })
}
