import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { isLocale } from '@dhakalive/config'

import { MediaImage } from '../../../../../components/MediaImage'
import { RichText } from '../../../../../components/RichText'
import { Breadcrumbs } from '../../../../../components/Breadcrumbs'
import { dictionary } from '../../../../../lib/dictionary'
import { formatDateTime, isoDate } from '../../../../../lib/format'
import { buildMetadata } from '../../../../../lib/metadata'
import { getLiveBlogBySlug, getLiveBlogUpdates } from '../../../../../lib/queries/taxonomy'
import { liveBlogPath } from '../../../../../lib/routes'

/**
 * Live blog.
 *
 * A much shorter revalidation window than an article: during live coverage the
 * timeline is the story, and a minute-old page is visibly stale. Publishing an
 * update also triggers on-demand revalidation (Phase 5), so this is the floor
 * rather than the mechanism.
 */
export const revalidate = 15

interface RouteParams {
  params: Promise<{ locale: string; slug: string }>
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { locale: raw, slug } = await params
  if (!isLocale(raw)) return {}
  const decoded = decodeURIComponent(slug)
  const liveBlog = await getLiveBlogBySlug(decoded, raw)
  if (!liveBlog) return {}

  return buildMetadata({
    locale: raw,
    title: liveBlog.title ?? '',
    description: liveBlog.summary,
    path: liveBlogPath(raw, decoded),
    seo: liveBlog.seo,
    type: 'article',
    publishedTime: liveBlog.startedAt,
  })
}

export default async function LiveBlogPage({ params }: RouteParams) {
  const { locale: raw, slug } = await params
  if (!isLocale(raw)) notFound()
  const locale = raw
  const d = dictionary(locale)
  const decoded = decodeURIComponent(slug)

  const liveBlog = await getLiveBlogBySlug(decoded, locale)
  if (!liveBlog) notFound()

  const updates = await getLiveBlogUpdates(liveBlog.id, locale)
  const isLive = liveBlog.status === 'live'

  return (
    <article className="mx-auto max-w-3xl">
      <Breadcrumbs locale={locale} crumbs={[{ label: liveBlog.title ?? '' }]} />

      <header className="mt-4">
        <p className="mb-2 flex items-center gap-2">
          <span
            className={
              isLive
                ? 'inline-flex items-center gap-2 rounded-sm bg-[var(--color-breaking)] px-2 py-0.5 text-xs font-bold text-white uppercase'
                : 'inline-flex items-center rounded-sm bg-[var(--color-surface-sunken)] px-2 py-0.5 text-xs font-bold uppercase'
            }
          >
            {isLive ? <span aria-hidden="true" className="h-2 w-2 rounded-full bg-white" /> : null}
            {isLive ? d('liveNow') : d('liveEnded')}
          </span>
        </p>

        <h1 className="text-3xl leading-tight font-bold tracking-tight md:text-4xl">
          {liveBlog.title}
        </h1>

        {liveBlog.summary ? (
          <p className="mt-3 text-lg text-[var(--color-ink-muted)]">{liveBlog.summary}</p>
        ) : null}

        {liveBlog.startedAt ? (
          <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
            <time dateTime={isoDate(liveBlog.startedAt)}>
              {formatDateTime(liveBlog.startedAt, locale)}
            </time>
          </p>
        ) : null}
      </header>

      {/*
        `aria-live` is deliberately NOT used. The timeline updates on navigation
        or revalidation, not in place, and announcing an entire re-rendered list
        would flood a screen reader.
      */}
      <ol className="mt-10 space-y-8 border-l-2 border-[var(--color-rule)] pl-5">
        {updates.map((update) => {
          const author =
            typeof update.author === 'object' && update.author !== null ? update.author : null

          return (
            <li key={update.id} className="relative">
              <span
                aria-hidden="true"
                className="absolute top-2 -left-[27px] h-3 w-3 rounded-full border-2 border-[var(--color-surface)] bg-[var(--color-brand)]"
              />

              <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--color-ink-muted)]">
                <time dateTime={isoDate(update.publishedAt)} className="font-medium">
                  {formatDateTime(update.publishedAt, locale)}
                </time>
                {update.isPinned ? (
                  <span className="rounded-sm bg-[var(--color-surface-sunken)] px-2 py-0.5 text-xs font-semibold">
                    {d('pinned')}
                  </span>
                ) : null}
                {update.isCorrection ? (
                  <span className="rounded-sm bg-[var(--color-surface-sunken)] px-2 py-0.5 text-xs font-semibold">
                    {d('correction')}
                  </span>
                ) : null}
              </div>

              {update.headline ? (
                <h2 className="mt-1 text-xl font-semibold">{update.headline}</h2>
              ) : null}

              <RichText data={update.content} className="mt-2 space-y-3 leading-relaxed" />

              {update.media ? (
                <div className="relative mt-3 aspect-[16/9] overflow-hidden rounded-md bg-[var(--color-surface-sunken)]">
                  <MediaImage
                    media={update.media}
                    fill
                    sizes="(min-width: 768px) 720px, 100vw"
                    className="object-cover"
                  />
                </div>
              ) : null}

              {author ? (
                <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                  {d('by')} {author.displayName}
                </p>
              ) : null}
            </li>
          )
        })}
      </ol>
    </article>
  )
}
