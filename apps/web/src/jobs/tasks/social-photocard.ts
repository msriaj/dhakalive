import { DEFAULT_LOCALE, getServerEnv, type SocialPlatformName } from '@dhakalive/config'
import type { TaskConfig } from 'payload'

import { absoluteUrl, articlePath } from '../../lib/routes'
import { buildCaption } from '../../lib/social/caption'
import { formatCardDate, renderPhotocard } from '../../lib/social/photocard'
import { recordOutcomeOnMessage, sendApprovalRequest } from '../../lib/social/telegram'
import { postPhotocard } from '../../lib/social/upload-post'
import { RETRY_REMOTE } from '../queues'
import { correlationIdField, logFailure, taskLogger } from '../telemetry'
import type { SocialPhotocardInput } from '../types'

/**
 * Renders a photocard for one article and posts it to the configured platforms
 * (Facebook, Instagram and Threads by default) in a single Upload-Post request.
 *
 * Queued by the publish transition (editor or scheduler — both arrive here
 * through the same `afterChange` hook). The job re-reads the article when it
 * runs and re-checks every precondition, so a story unpublished between queue
 * and run is not posted, and a headline corrected in that window goes out
 * corrected.
 *
 * ## Posting exactly once, per platform
 *
 * Each platform records its own `<platform>PostedAt` on the article, and a run
 * only posts to platforms that lack one. A partial failure — Instagram down,
 * Facebook fine — therefore records the successes and throws for the retry,
 * and the retry posts only to what is still missing. The `Idempotency-Key`
 * varies with that pending set, so the retry is a new request to the API while
 * a replay of a lost response is still recognised and absorbed.
 */

interface SocialPhotocardOutput {
  posted: number
  /** Why nothing was attempted, when that is the correct outcome. */
  skipped?: string
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
  return { output: { posted: 0, skipped: reason } }
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

/** `socialPosts` as stored on the article: per-platform date/url pairs. */
type SocialPostsState = Partial<Record<string, unknown>>

function postedAtKey(platform: SocialPlatformName): string {
  return `${platform}PostedAt`
}

function postUrlKey(platform: SocialPlatformName): string {
  return `${platform}PostUrl`
}

export const socialPhotocard: TaskConfig<{
  input: SocialPhotocardInput
  output: SocialPhotocardOutput
}> = {
  slug: 'social-photocard',
  label: 'Post an article photocard to social platforms',
  retries: RETRY_REMOTE,

  inputSchema: [correlationIdField, { name: 'articleId', type: 'text', required: true }],

  outputSchema: [
    { name: 'posted', type: 'number' },
    { name: 'skipped', type: 'text' },
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

    const state = (article.socialPosts ?? {}) as SocialPostsState
    const pending = env.SOCIAL_AUTOPOST_PLATFORMS.filter(
      (platform) => !state[postedAtKey(platform)],
    )
    if (pending.length === 0) return skip('already posted everywhere configured')

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

    const publishedAt =
      typeof article.publishedAt === 'string' ? new Date(article.publishedAt) : new Date()

    const primaryCategory = article.primaryCategory as
      { title?: unknown; slug?: unknown } | null | undefined
    const categoryTitle = primaryCategory?.title

    /**
     * The article link rides as the first comment on the Facebook post. Not in
     * the caption — Facebook's feed algorithm throttles captioned links, and
     * on Instagram and Threads a URL is dead text. 'news' mirrors the
     * structured-data fallback for an article missing its category.
     */
    const categorySlug = typeof primaryCategory?.slug === 'string' ? primaryCategory.slug : 'news'
    const slug = typeof article.slug === 'string' ? article.slug : input.articleId
    const articleUrl = absoluteUrl(
      articlePath(DEFAULT_LOCALE, categorySlug, slug),
      env.NEXT_PUBLIC_SITE_URL,
    )

    const card = await renderPhotocard({
      headline,
      photo,
      dateLabel: formatCardDate(publishedAt),
      siteLabel: new URL(env.NEXT_PUBLIC_SITE_URL).host,
      categoryLabel: typeof categoryTitle === 'string' ? categoryTitle : null,
      isBreaking: article.isBreaking === true,
    })

    const caption = buildCaption({
      headline,
      summary: typeof article.summary === 'string' ? article.summary : null,
    })

    /**
     * The approval gate. First arrival sends the card to the editors' group
     * and parks the article as pending; the job then ends successfully — the
     * button tap, not a retry, is what wakes this flow up again, via the
     * webhook writing `approvalStatus` and the hook queueing a fresh job.
     * Declined stays declined until someone flips the field.
     */
    if (env.SOCIAL_APPROVAL_REQUIRED && env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
      const approval = state.approvalStatus
      if (approval === 'declined') return skip('photocard declined')
      if (approval === 'pending') return skip('awaiting approval')
      if (approval !== 'approved') {
        const messageId = await sendApprovalRequest({
          botToken: env.TELEGRAM_BOT_TOKEN,
          chatId: env.TELEGRAM_CHAT_ID,
          photo: card,
          caption,
          articleId: input.articleId,
        })

        await req.payload.update({
          collection: 'articles',
          id: input.articleId,
          data: {
            socialPosts: {
              approvalStatus: 'pending',
              approvalRequestedAt: new Date().toISOString(),
              approvalMessageId: messageId,
            },
          },
          depth: 0,
          locale: DEFAULT_LOCALE,
          overrideAccess: true,
          context: { isSocialPostUpdate: true },
        })

        logger.info({ messageId }, 'Photocard sent for approval')
        return { output: { posted: 0, skipped: 'approval requested' } }
      }
    }

    const results = await postPhotocard({
      apiKey: env.UPLOAD_POST_API_KEY,
      profile: env.UPLOAD_POST_PROFILE,
      platforms: pending,
      facebookPageId: env.UPLOAD_POST_FACEBOOK_PAGE_ID,
      photo: card,
      filename: `photocard-${input.articleId}.jpg`,
      caption,
      facebookFirstComment: articleUrl,
      idempotencyKey: `social-photocard-${input.articleId}-${pending.join('-')}`,
    })

    const now = new Date().toISOString()
    const record: Record<string, unknown> = {}
    const failed: string[] = []
    for (const platform of pending) {
      const result = results[platform]
      if (result?.posted) {
        record[postedAtKey(platform)] = now
        record[postUrlKey(platform)] = result.postUrl
      } else {
        failed.push(`${platform}: ${result?.error ?? 'missing from response'}`)
      }
    }

    if (Object.keys(record).length > 0) {
      await req.payload.update({
        collection: 'articles',
        id: input.articleId,
        data: { socialPosts: record },
        depth: 0,
        locale: DEFAULT_LOCALE,
        overrideAccess: true,
        // Lets the queueing hook tell this bookkeeping write from an edit, so
        // recording the posts cannot queue another post. Deliberately not on
        // `req`: the throw below for a partial failure must not roll back the
        // record of what *did* post, or the retry would post those again.
        context: { isSocialPostUpdate: true },
      })
    }

    const posted = pending.length - failed.length
    logger.info({ posted, failed }, 'Photocard run finished')

    /**
     * Close the loop on the approval message, best-effort: the group's history
     * should read "requested → approved → posted". A Telegram hiccup here must
     * not fail a job whose actual work — the posts — already succeeded.
     */
    if (posted > 0 && env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
      const messageId = state.approvalMessageId
      if (typeof messageId === 'number') {
        const decidedBy =
          typeof state.approvalDecidedBy === 'string'
            ? ` — approved by ${state.approvalDecidedBy}`
            : ''
        await recordOutcomeOnMessage({
          botToken: env.TELEGRAM_BOT_TOKEN,
          chatId: env.TELEGRAM_CHAT_ID,
          messageId,
          caption: `✅ পোস্ট হয়েছে${decidedBy}\n\n${caption}`,
        }).catch((error: unknown) => {
          logger.warn({ err: error, messageId }, 'Could not update the approval message')
        })
      }
    }

    if (failed.length > 0) {
      // Retryable: the platforms already recorded above are excluded next run.
      throw new Error(`Photocard failed for ${failed.join('; ')}`)
    }

    return { output: { posted } }
  },
}
