import type { SocialPlatformName } from '@dhakalive/config'

/**
 * Client for the Upload-Post API (https://docs.upload-post.com).
 *
 * One endpoint is used: `POST /api/upload_photos`, multipart, which publishes a
 * photo to every requested platform in a single request. The service holds the
 * platform OAuth grants; we hold only its API key, which is what makes this a
 * thin HTTP client rather than three platform SDK integrations.
 */

const UPLOAD_PHOTOS_URL = 'https://api.upload-post.com/api/upload_photos'

export interface PhotocardPost {
  apiKey: string
  /** Upload-Post profile with the target accounts connected. */
  profile: string
  /** Platforms to publish to, in one request. */
  platforms: readonly SocialPlatformName[]
  /** Optional when the profile has one Facebook page connected or one pinned. */
  facebookPageId?: string
  photo: Buffer
  filename: string
  /** Facebook caption. */
  title: string
  /** Facebook extended text; the other platforms ignore it. */
  description?: string
  /** Single-field caption for Instagram and Threads. */
  fullCaption: string
  /**
   * Suppresses a duplicate post when a retry re-sends a request whose response
   * was lost. Sent as the documented `Idempotency-Key` header. Callers vary it
   * with the platform set, so a retry for the platforms that failed is a new
   * request rather than a replay of the one that half-succeeded.
   */
  idempotencyKey: string
}

export interface PlatformPostResult {
  posted: boolean
  postUrl: string | null
  postId: string | null
  error: string | null
}

/** Whole-request failures land here, with the API's own message. */
export class UploadPostError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = 'UploadPostError'
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

export async function postPhotocard(
  post: PhotocardPost,
): Promise<Partial<Record<SocialPlatformName, PlatformPostResult>>> {
  const body = new FormData()
  body.set('user', post.profile)
  for (const platform of post.platforms) body.append('platform[]', platform)
  body.append(
    'photos[]',
    new Blob([new Uint8Array(post.photo)], { type: 'image/jpeg' }),
    post.filename,
  )
  body.set('title', post.title)
  if (post.description) body.set('description', post.description)
  if (post.platforms.includes('instagram')) body.set('instagram_title', post.fullCaption)
  if (post.platforms.includes('threads')) body.set('threads_title', post.fullCaption)
  if (post.facebookPageId && post.platforms.includes('facebook')) {
    body.set('facebook_page_id', post.facebookPageId)
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

  const results: Partial<Record<SocialPlatformName, PlatformPostResult>> = {}
  for (const platform of post.platforms) {
    const result = parsed.results?.[platform]
    if (!result) {
      /**
       * A successful response without per-platform results means the upload
       * switched to async processing past the API's 59s timeout. Counted as
       * posted: the upload is in flight and the idempotency key would make a
       * retry a no-op anyway, so failing here could only produce noise.
       */
      results[platform] = { posted: true, postUrl: null, postId: null, error: null }
      continue
    }
    const posted = result.success !== false
    results[platform] = {
      posted,
      postUrl: result.url ?? null,
      postId: result.post_id ?? null,
      error: posted ? null : (result.error ?? 'no error detail in response'),
    }
  }
  return results
}
