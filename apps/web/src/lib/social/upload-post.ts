/**
 * Client for the Upload-Post API (https://docs.upload-post.com).
 *
 * One endpoint is used: `POST /api/upload_photos`, multipart, which publishes a
 * photo to the Facebook page connected to the configured profile. The service
 * holds the Facebook OAuth grant; we hold only its API key, which is what makes
 * this a thin HTTP client rather than a Meta SDK integration.
 */

const UPLOAD_PHOTOS_URL = 'https://api.upload-post.com/api/upload_photos'

export interface FacebookPhotoPost {
  apiKey: string
  /** Upload-Post profile that has the Facebook page connected. */
  profile: string
  /** Optional when the profile has one page connected or one pinned. */
  facebookPageId?: string
  photo: Buffer
  filename: string
  /** Caption shown on the post. */
  title: string
  /** Extended text; Upload-Post appends it as the Facebook description. */
  description?: string
  /**
   * Suppresses a duplicate post when a retry re-sends a request whose response
   * was lost. Sent as the documented `Idempotency-Key` header.
   */
  idempotencyKey: string
}

export interface FacebookPostResult {
  /** URL of the published post, when the API reports one. */
  postUrl: string | null
  postId: string | null
}

/** Non-2xx and per-platform failures both land here, with the API's message. */
export class UploadPostError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = 'UploadPostError'
  }
}

interface PlatformResult {
  success?: boolean
  url?: string
  post_id?: string
  error?: string
}

interface UploadPhotosResponse {
  success?: boolean
  message?: string
  error?: string
  results?: Record<string, PlatformResult>
}

export async function postPhotoToFacebook(post: FacebookPhotoPost): Promise<FacebookPostResult> {
  const body = new FormData()
  body.set('user', post.profile)
  body.append('platform[]', 'facebook')
  body.append(
    'photos[]',
    new Blob([new Uint8Array(post.photo)], { type: 'image/jpeg' }),
    post.filename,
  )
  body.set('title', post.title)
  if (post.description) body.set('description', post.description)
  if (post.facebookPageId) body.set('facebook_page_id', post.facebookPageId)

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

  const facebook = parsed.results?.facebook
  if (facebook?.success === false) {
    throw new UploadPostError(
      `Facebook publish failed: ${facebook.error ?? 'no error detail in response'}`,
      response.status,
    )
  }

  return {
    postUrl: facebook?.url ?? null,
    postId: facebook?.post_id ?? null,
  }
}
