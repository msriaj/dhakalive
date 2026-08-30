import type { SocialPlatformName } from '@dhakalive/config'

/**
 * Client for the Upload-Post API (https://docs.upload-post.com).
 *
 * One endpoint is used: `POST /api/upload_photos`, multipart. The service
 * holds the platform OAuth grants; we hold only its API key, which is what
 * makes this a thin HTTP client rather than five platform SDK integrations.
 *
 * One request per platform, deliberately. The API accepts a platform list, but
 * a request-level rejection — a daily cap reached on one platform — then
 * blocks every platform in the request. Sent singly, Facebook hitting its cap
 * costs Facebook alone; Instagram, Threads, LinkedIn and X still go out.
 */

const UPLOAD_PHOTOS_URL = 'https://api.upload-post.com/api/upload_photos'

export interface PhotocardPost {
  apiKey: string
  /** Upload-Post profile with the target accounts connected. */
  profile: string
  /** The platform this request publishes to. */
  platform: SocialPlatformName
  /** Optional when the profile has one Facebook page connected or one pinned. */
  facebookPageId?: string
  photo: Buffer
  filename: string
  /**
   * The caption, identical on every platform. Sent only as `title`: sending
   * `description` or per-platform titles alongside it made the platforms
   * disagree — Facebook hid the description, Instagram preferred it over its
   * own title. See `caption.ts`.
   */
  caption: string
  /** Headline alone, for platforms with hard length caps (X). */
  headline: string
  /**
   * Posted automatically as the first comment on the Facebook post — the
   * article link lives there, where Facebook does not throttle it and the
   * caption stays clean. Sent only on the Facebook request.
   */
  facebookFirstComment?: string
  /**
   * Suppresses a duplicate post when a retry re-sends a request whose response
   * was lost. Sent as the documented `Idempotency-Key` header. Callers vary it
   * per platform, so one platform's retry never replays another's request.
   */
  idempotencyKey: string
}

export interface PlatformPostResult {
  postUrl: string | null
  postId: string | null
}

/** Failures land here, with the API's own message. */
export class UploadPostError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = 'UploadPostError'
  }

  /**
   * A daily posting cap is not an error a retry policy can fix — the window
   * is 24 hours. Detected by message because the API carries no machine-
   * readable code for it; the caller defers instead of retrying.
   */
  get isDailyCap(): boolean {
    return /daily posting cap/i.test(this.message)
  }
}

interface PlatformResponse {
  success?: boolean
  url?: string
  post_id?: string
  error?: string
}

interface UploadPhotosResponse {
  success?: boolean
  message?: string
  error?: string
  results?: Record<string, PlatformResponse>
}

/** Publishes the card to one platform. Throws `UploadPostError` on failure. */
export async function postPhotocardTo(post: PhotocardPost): Promise<PlatformPostResult> {
  const body = new FormData()
  body.set('user', post.profile)
  body.append('platform[]', post.platform)
  body.append(
    'photos[]',
    new Blob([new Uint8Array(post.photo)], { type: 'image/jpeg' }),
    post.filename,
  )
  body.set('title', post.caption)
  /**
   * X caps a post at 280 characters and the API rejects rather than truncates,
   * so X gets the headline alone — the card carries the rest. Every other
   * platform takes the full caption from `title`.
   */
  if (post.platform === 'x') {
    body.set('x_title', post.headline.slice(0, 275))
  }
  if (post.platform === 'facebook') {
    if (post.facebookFirstComment) body.set('facebook_first_comment', post.facebookFirstComment)
    if (post.facebookPageId) body.set('facebook_page_id', post.facebookPageId)
  }

  const response = await fetch(UPLOAD_PHOTOS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Apikey ${post.apiKey}`,
      'Idempotency-Key': post.idempotencyKey,
    },
    body,
  })

  let parsed: UploadPhotosResponse
  try {
    parsed = (await response.json()) as UploadPhotosResponse
  } catch {
    throw new UploadPostError(`Upload-Post returned a non-JSON response`, response.status)
  }

  if (!response.ok || parsed.success === false) {
    // The API's own message names the actual problem (bad page id, quota,
    // disconnected account); the status alone would not.
    const detail = parsed.message ?? parsed.error ?? 'no error detail in response'
    throw new UploadPostError(`Upload-Post request failed: ${detail}`, response.status)
  }

  const result = parsed.results?.[post.platform]
  if (!result) {
    /**
     * A successful response without a per-platform result means the upload
     * switched to async processing past the API's 59s timeout. Counted as
     * posted: the upload is in flight and the idempotency key would make a
     * retry a no-op anyway, so failing here could only produce noise.
     */
    return { postUrl: null, postId: null }
  }
  if (result.success === false) {
    throw new UploadPostError(
      `${post.platform} publish failed: ${result.error ?? 'no error detail in response'}`,
      response.status,
    )
  }
  return { postUrl: result.url ?? null, postId: result.post_id ?? null }
}
