import { timingSafeEqual } from 'node:crypto'

import { NextResponse } from 'next/server'

import { DEFAULT_LOCALE } from '@dhakalive/config'
import { getLogger } from '@dhakalive/observability'

import { env } from '../../../../lib/env'
import { getPayloadClient } from '../../../../lib/queries/client'
import {
  answerCallback,
  parseApprovalCallback,
  recordOutcomeOnMessage,
} from '../../../../lib/social/telegram'

/**
 * Telegram webhook for photocard approvals.
 *
 * Receives the Approve/Decline button taps and writes the decision onto the
 * article. That write is the whole job: the collection's `afterChange` hook
 * sees `approvalStatus` become `approved` and queues the posting job, exactly
 * as it would for an admin flipping the field in the CMS. One path, two doors.
 *
 * Always answers 200 once the request is authenticated — Telegram retries
 * non-2xx responses for days, and a malformed update will not improve with
 * repetition.
 */
export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 64 * 1024

/** Constant-time comparison; see the revalidate route for why. */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) {
    timingSafeEqual(a, a)
    return false
  }
  return timingSafeEqual(a, b)
}

interface CallbackQuery {
  id?: unknown
  data?: unknown
  from?: { first_name?: unknown; last_name?: unknown; username?: unknown }
  message?: { message_id?: unknown; caption?: unknown; chat?: { id?: unknown } }
}

function nameOf(from: CallbackQuery['from']): string {
  const username = typeof from?.username === 'string' ? `@${from.username}` : null
  const parts = [from?.first_name, from?.last_name].filter(
    (part): part is string => typeof part === 'string',
  )
  return username ?? (parts.length > 0 ? parts.join(' ') : 'unknown')
}

export async function POST(request: Request): Promise<NextResponse> {
  const logger = getLogger()
  const serverEnv = env()
  const headers = { 'cache-control': 'no-store' }

  const secret = serverEnv.TELEGRAM_WEBHOOK_SECRET
  if (!secret || !serverEnv.TELEGRAM_BOT_TOKEN || !serverEnv.TELEGRAM_CHAT_ID) {
    return NextResponse.json({ error: 'Not configured' }, { status: 404, headers })
  }

  if (!secretMatches(request.headers.get('x-telegram-bot-api-secret-token'), secret)) {
    // No detail: a caller without the secret learns nothing about what exists.
    logger.warn('Telegram webhook rejected: bad secret token')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
  }

  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: true }, { headers })
  }

  let update: { callback_query?: CallbackQuery }
  try {
    update = JSON.parse(raw) as { callback_query?: CallbackQuery }
  } catch {
    return NextResponse.json({ ok: true }, { headers })
  }

  const callback = update.callback_query
  const parsed = parseApprovalCallback(callback?.data)
  if (!callback || !parsed) {
    // Message posts, member joins and other chat noise arrive here too.
    return NextResponse.json({ ok: true }, { headers })
  }

  /**
   * The chat check is authorisation, not paranoia: anyone who can message the
   * bot could otherwise forward the approval message to their own chat and tap
   * the still-live buttons there.
   */
  const rawChatId = callback.message?.chat?.id
  const chatId =
    typeof rawChatId === 'number' || typeof rawChatId === 'string' ? String(rawChatId) : ''
  if (chatId !== serverEnv.TELEGRAM_CHAT_ID) {
    logger.warn({ chatId }, 'Telegram webhook: tap from an unexpected chat ignored')
    return NextResponse.json({ ok: true }, { headers })
  }

  const decidedBy = nameOf(callback.from)
  const approved = parsed.decision === 'approve'

  try {
    const payload = await getPayloadClient()
    await payload.update({
      collection: 'articles',
      id: parsed.articleId,
      data: {
        socialPosts: {
          approvalStatus: approved ? 'approved' : 'declined',
          approvalDecidedBy: decidedBy,
        },
      },
      depth: 0,
      locale: DEFAULT_LOCALE,
      overrideAccess: true,
      // Deliberately NOT isSocialPostUpdate: this write is the trigger the
      // queueing hook listens for.
    })
  } catch (error) {
    logger.error({ err: error, articleId: parsed.articleId }, 'Telegram approval write failed')
    // 500 so Telegram retries: the tap happened, the record of it must not be
    // lost to a transient database error.
    return NextResponse.json({ error: 'Failed' }, { status: 500, headers })
  }

  logger.info(
    { articleId: parsed.articleId, decision: parsed.decision, decidedBy },
    'Photocard approval decision recorded',
  )

  /**
   * Cosmetics after the state change, best-effort: the spinner on the tapped
   * button, and the outcome written onto the message. Failures here change
   * nothing about the decision, so they only warn.
   */
  const token = serverEnv.TELEGRAM_BOT_TOKEN
  if (typeof callback.id === 'string') {
    await answerCallback(token, callback.id, approved ? 'Approved ✅' : 'Declined ❌').catch(
      () => undefined,
    )
  }
  const messageId = callback.message?.message_id
  if (typeof messageId === 'number') {
    const line = approved ? `✅ Approved by ${decidedBy} — posting…` : `❌ Declined by ${decidedBy}`
    // Keep the caption the editor judged; the outcome goes above it.
    const original = typeof callback.message?.caption === 'string' ? callback.message.caption : ''
    await recordOutcomeOnMessage({
      botToken: token,
      chatId,
      messageId,
      caption: original ? `${line}\n\n${original}` : line,
    }).catch((error: unknown) => {
      logger.warn({ err: error, messageId }, 'Could not update the approval message')
    })
  }

  return NextResponse.json({ ok: true }, { headers })
}

/** Anything other than POST is refused. */
export function GET(): NextResponse {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405, headers: { 'cache-control': 'no-store', allow: 'POST' } },
  )
}
