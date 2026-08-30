import { DEFAULT_LOCALE, getServerEnv } from '@dhakalive/config'
import type { TaskConfig } from 'payload'

import { articlePath, absoluteUrl } from '../../lib/routes'
import { buildFacebookCaption } from '../../lib/social/caption'
import { formatCardDate, renderPhotocard } from '../../lib/social/photocard'
import { postPhotoToFacebook } from '../../lib/social/upload-post'
import { RETRY_REMOTE } from '../queues'
import { correlationIdField, logFailure, taskLogger } from '../telemetry'
import type { SocialPhotocardInput } from '../types'

/**
 * Renders a photocard for one article and posts it to the Facebook page.
 *
 * Queued by the publish transition (editor or scheduler — both arrive here
 * through the same `afterChange` hook). The job re-reads the article when it
 * runs and re-checks every precondition, so a story unpublished between queue
 * and run is not posted, and a headline corrected in that window goes out
 * corrected.
 *
 * ## Posting exactly once
 *
 * Three layers, weakest to strongest: the queueing hook only fires on the
 * not-published → published transition; `facebookPostedAt` on the article is
 * checked before posting and written after; and the request carries an
 * `Idempotency-Key` derived from the article id, so the failure mode that
 * neither of the first two can cover — posted successfully, crashed before
 * recording it — is absorbed by the API returning the existing upload instead
 * of creating a second post.
 */

interface SocialPhotocardOutput {
  posted: boolean
  /** Why nothing was posted, when that is the correct outcome. */
  skipped?: string
  postUrl?: string
  [k: string]: unknown
}

interface MediaSize {
  url?: string | null
}

interface MediaDoc {
  url?: string | null
  mimeType?: string | null
  sizes?: { wide?: MediaSize | null } | null
}

function skip(reason: string): { output: SocialPhotocardOutput } {
  return { output: { posted: false, skipped: reason } }
}

/**
 * The photograph, at feed resolution.
 *
 * The `wide` rendition (1600px) when it exists, the original otherwise. Media
 * URLs are absolute on R2 and site-relative under dev's disk storage; resolving
 * against the site URL handles both.
 */
function photoUrlOf(media: MediaDoc, siteUrl: string): string | null {
  const path = media.sizes?.wide?.url ?? media.url
  if (typeof path !== 'string' || path.length === 0) return null
  return new URL(path, siteUrl).toString()
}

export const socialPhotocard: TaskConfig<{
  input: SocialPhotocardInput
  output: SocialPhotocardOutput
}> = {
  slug: 'social-photocard',
  label: 'Post an article photocard to Facebook',
  retries: RETRY_REMOTE,

  inputSchema: [correlationIdField, { name: 'articleId', type: 'text', required: true }],

  outputSchema: [
    { name: 'posted', type: 'checkbox' },
    { name: 'skipped', type: 'text' },
    { name: 'postUrl', type: 'text' },
  ],

  /**
   * One job per article, and a newer one supersedes a pending one — the same
   * shape as `search-index`, because the input is likewise only an identity.
   */
  concurrency: {
    key: ({ input }) => `social-photocard:article:${input.articleId}`,
    exclusive: true,
    supersedes: true,
  },

  onFail: logFailure('social-photocard', RETRY_REMOTE.attempts ?? 0),

  handler: async ({ input, req }) => {
    const logger = taskLogger('social-photocard', input, { articleId: input.articleId })
    const env = getServerEnv()

    // Re-checked here, not only at queue time: the flag may have been turned
    // off while this job waited, and off means off.
    if (!env.SOCIAL_AUTOPOST_ENABLED || !env.UPLOAD_POST_API_KEY || !env.UPLOAD_POST_PROFILE) {
      return skip('auto-posting disabled')
    }

    const article = (await req.payload
      .findByID({
        collection: 'articles',
        id: input.articleId,
        depth: 1,
        locale: DEFAULT_LOCALE,
        overrideAccess: true,
        req,
      })
      .catch(() => null)) as Record<string, unknown> | null

    if (!article) return skip('article no longer exists')
    if (article.workflowStatus !== 'published') return skip('article is not published')

    const alreadyPosted = (article.socialPosts as { facebookPostedAt?: unknown } | undefined)
      ?.facebookPostedAt
    if (alreadyPosted) return skip('already posted')

    const headline = typeof article.headline === 'string' ? article.headline.trim() : ''
    if (!headline) return skip('article has no headline in the default locale')

    const media = article.featuredImage
    if (!media || typeof media !== 'object') return skip('article has no featured image')

    const mediaDoc = media as MediaDoc
    const photoUrl = photoUrlOf(mediaDoc, env.NEXT_PUBLIC_SITE_URL)
    const mimeType = typeof mediaDoc.mimeType === 'string' ? mediaDoc.mimeType : ''
    if (!photoUrl || !mimeType.startsWith('image/')) {
      return skip('featured media is not a usable image')
    }

    const photoResponse = await fetch(photoUrl, { signal: AbortSignal.timeout(30_000) })
    if (!photoResponse.ok) {
      // Retryable: a CDN blip is the likely cause, and RETRY_REMOTE covers it.
      throw new Error(`Fetching the featured image failed with HTTP ${photoResponse.status}`)
    }
    const photo = Buffer.from(await photoResponse.arrayBuffer())

    const categoryValue = (article.primaryCategory as { slug?: unknown } | null | undefined)?.slug
    // 'news' mirrors the structured-data fallback for an article missing its category.
    const categorySlug = typeof categoryValue === 'string' ? categoryValue : 'news'
    const slug = typeof article.slug === 'string' ? article.slug : input.articleId
    const url = absoluteUrl(
      articlePath(DEFAULT_LOCALE, categorySlug, slug),
      env.NEXT_PUBLIC_SITE_URL,
    )

    const publishedAt =
      typeof article.publishedAt === 'string' ? new Date(article.publishedAt) : new Date()

    const card = await renderPhotocard({
      headline,
      photo,
      dateLabel: formatCardDate(publishedAt),
      siteLabel: new URL(env.NEXT_PUBLIC_SITE_URL).host,
    })

    const caption = buildFacebookCaption({
      headline,
      summary: typeof article.summary === 'string' ? article.summary : null,
      url,
    })

    const result = await postPhotoToFacebook({
      apiKey: env.UPLOAD_POST_API_KEY,
      profile: env.UPLOAD_POST_PROFILE,
      facebookPageId: env.UPLOAD_POST_FACEBOOK_PAGE_ID,
      photo: card,
      filename: `photocard-${input.articleId}.jpg`,
      title: caption.title,
      description: caption.description,
      idempotencyKey: `social-photocard-${input.articleId}`,
    })

    await req.payload.update({
      collection: 'articles',
      id: input.articleId,
      data: {
        socialPosts: {
          facebookPostedAt: new Date().toISOString(),
          facebookPostUrl: result.postUrl,
        },
      },
      depth: 0,
      locale: DEFAULT_LOCALE,
      overrideAccess: true,
      // Lets the queueing hook tell this bookkeeping write from an edit, so
      // recording the post cannot queue another post.
      context: { isSocialPostUpdate: true },
      req,
    })

    logger.info({ postUrl: result.postUrl }, 'Photocard posted to Facebook')

    return { output: { posted: true, ...(result.postUrl ? { postUrl: result.postUrl } : {}) } }
  },
}
