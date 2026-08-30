/**
 * Telegram Bot API client for the photocard approval flow.
 *
 * The worker sends the rendered card to the editors' group with Approve and
 * Decline buttons; the tap comes back through the webhook route, which updates
 * the article and lets the normal posting hook take it from there. Telegram
 * was chosen over WhatsApp deliberately: a bot token from @BotFather against
 * Meta's Business Cloud API, template review and per-message pricing.
 */

const API_BASE = 'https://api.telegram.org'

export interface ApprovalRequest {
  botToken: string
  chatId: string
  photo: Buffer
  caption: string
  articleId: string
}

/** Callback payloads are minted here and parsed by `parseApprovalCallback`. */
export type ApprovalDecision = 'approve' | 'decline'

export interface ApprovalCallback {
  decision: ApprovalDecision
  articleId: string
}

export class TelegramError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = 'TelegramError'
  }
}

interface TelegramResponse<T> {
  ok?: boolean
  description?: string
  result?: T
}

async function call<T>(
  botToken: string,
  method: string,
  body: FormData | Record<string, unknown>,
): Promise<T> {
  const isForm = body instanceof FormData
  const response = await fetch(`${API_BASE}/bot${botToken}/${method}`, {
    method: 'POST',
    ...(isForm
      ? { body }
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })

  let parsed: TelegramResponse<T>
  try {
    parsed = (await response.json()) as TelegramResponse<T>
  } catch {
    throw new TelegramError(`Telegram ${method} returned a non-JSON response`, response.status)
  }

  if (!response.ok || parsed.ok === false) {
    throw new TelegramError(
      `Telegram ${method} failed: ${parsed.description ?? 'no detail in response'}`,
      response.status,
    )
  }
  if (parsed.result === undefined) {
    throw new TelegramError(`Telegram ${method} returned no result`, response.status)
  }
  return parsed.result
}

/**
 * Sends the card with Approve/Decline buttons. Returns the message id, which
 * is stored on the article so the outcome can be written back onto the
 * message the editor actually tapped.
 */
export async function sendApprovalRequest(request: ApprovalRequest): Promise<number> {
  const body = new FormData()
  body.set('chat_id', request.chatId)
  body.append(
    'photo',
    new Blob([new Uint8Array(request.photo)], { type: 'image/jpeg' }),
    `photocard-${request.articleId}.jpg`,
  )
  // Telegram caps photo captions at 1024 characters; a headline plus summary
  // fits, but the cap is enforced here rather than trusted.
  body.set('caption', request.caption.slice(0, 1024))
  body.set(
    'reply_markup',
    JSON.stringify({
      inline_keyboard: [
        [
          { text: '✅ Approve', callback_data: `approve:${request.articleId}` },
          { text: '❌ Decline', callback_data: `decline:${request.articleId}` },
        ],
      ],
    }),
  )

  const message = await call<{ message_id: number }>(request.botToken, 'sendPhoto', body)
  return message.message_id
}

/** Parses a button tap's callback_data. Null for anything this flow did not mint. */
export function parseApprovalCallback(data: unknown): ApprovalCallback | null {
  if (typeof data !== 'string') return null
  const match = /^(approve|decline):([\w-]+)$/.exec(data)
  if (!match?.[1] || !match[2]) return null
  return { decision: match[1] as ApprovalDecision, articleId: match[2] }
}

/** Dismisses the loading spinner on the tapped button. */
export async function answerCallback(
  botToken: string,
  callbackQueryId: string,
  text: string,
): Promise<void> {
  await call(botToken, 'answerCallbackQuery', { callback_query_id: callbackQueryId, text })
}

/**
 * Writes the outcome onto the approval message itself — buttons removed, a
 * status line appended — so the group's history reads as a log.
 */
export async function recordOutcomeOnMessage(args: {
  botToken: string
  chatId: string
  messageId: number
  caption: string
}): Promise<void> {
  await call(args.botToken, 'editMessageCaption', {
    chat_id: args.chatId,
    message_id: args.messageId,
    caption: args.caption.slice(0, 1024),
    reply_markup: { inline_keyboard: [] },
  })
}
