import Link from 'next/link'

import type { Locale } from '@dhakalive/config'

import { kickerFor, layoutForType, specForLayout } from '../lib/article-layout'
import { dictionary } from '../lib/dictionary'
import { getSiteSettings } from '../lib/queries/globals'
import { env } from '../lib/env'
import { formatDate, isoDate } from '../lib/format'
import { absoluteUrl, articlePath, categoryPath, tagPath } from '../lib/routes'
import type { Article, Tag } from '../payload-types'
import { AdSlot } from './AdSlot'
import { Breadcrumbs } from './Breadcrumbs'
import { Byline } from './Byline'
import { MediaImage } from './MediaImage'
import { PhotoCard } from './PhotoCard'
import { RichText } from './RichText'
import { ShareLinks } from './ShareLinks'

/**
 * One story, from its breadcrumb to its share row.
 *
 * Extracted from the route so the same markup renders whether a story is the
 * one the reader asked for or the next one appended beneath it. The alternative
 * — a second, simplified rendering for streamed articles — is how a photo essay
 * comes to look like a wire report the moment it is not the first thing on the
 * page, and it would put every layout rule in two places to drift apart.
 *
 * Deliberately no `JsonLd` and no related list: those belong to the page, once.
 */
export async function ArticleBody({
  article,
  locale,
  headingLevel = 1,
  priority = true,
}: {
  article: Article
  locale: Locale
  /**
   * `h1` for the story the URL names, `h2` for one streamed after it — a
   * document with six `h1`s tells a screen reader it has six titles.
   */
  headingLevel?: 1 | 2
  priority?: boolean
}) {
  const d = dictionary(locale)

  const category =
    typeof article.primaryCategory === 'object' && article.primaryCategory !== null
      ? article.primaryCategory
      : null

  const tags = Array.isArray(article.tags)
    ? article.tags.filter((tag): tag is Tag => typeof tag === 'object' && tag !== null)
    : []

  const layout = layoutForType(article.articleType)
  const spec = specForLayout(layout)
  const kicker = kickerFor(article.articleType, article.headline, locale)

  const shareUrl = absoluteUrl(
    articlePath(locale, category?.slug ?? 'news', article.slug ?? ''),
    env().NEXT_PUBLIC_SITE_URL,
  )

  /*
   * The picture card's inputs, resolved here because this component already
   * holds them and the card itself runs on the client, where the article
   * document is not available.
   */
  const heroAsset = typeof article.featuredImage === 'object' ? article.featuredImage : null
  const heroUrl = heroAsset?.url ?? null

  // Site settings are read here rather than passed in, because the stream
  // renders this component from a server action with no page props to hand down.
  const settings = await getSiteSettings(locale)
  const siteName = settings.siteName ?? 'DhakaLive'
  const logoAsset = typeof settings.logo === 'object' ? settings.logo : null
  const cardByline = [siteName, formatDate(article.publishedAt, locale)].filter(Boolean).join(' | ')

  /**
   * The hero is rendered from one definition in two possible positions rather
   * than duplicated per layout, so the caption and credit rules below cannot
   * drift between them.
   */
  const hero =
    spec.hero !== 'none' && article.featuredImage ? (
      <figure className={spec.hero === 'lead' ? 'mt-6 mb-8' : 'mt-6'}>
        <div
          className={`relative ${spec.heroAspect} overflow-hidden rounded-md bg-[var(--color-surface-sunken)]`}
        >
          <MediaImage
            media={article.featuredImage}
            fill
            priority={priority}
            sizes={spec.heroSizes}
            className="object-cover"
          />
        </div>
        {/*
          Credit renders independently of caption. Photographers and wire
          agencies must be attributed whether or not an editor wrote a caption,
          so nesting the credit inside the caption check would silently drop
          attribution on most images.
        */}
        {typeof article.featuredImage === 'object' &&
        (article.featuredImage.caption || article.featuredImage.credit) ? (
          <figcaption className="mt-2">
            {article.featuredImage.caption}
            {article.featuredImage.credit ? (
              <span className={article.featuredImage.caption ? 'ml-2 opacity-80' : 'opacity-80'}>
                {article.featuredImage.credit}
              </span>
            ) : null}
          </figcaption>
        ) : null}
      </figure>
    ) : null

  const heading =
    headingLevel === 1 ? (
      <h1 className={spec.headline}>{article.headline}</h1>
    ) : (
      <h2 className={spec.headline}>{article.headline}</h2>
    )

  const wide = `mx-auto ${spec.headerContainer}`
  const narrow = `mx-auto ${spec.container}`

  return (
    <>
      <div className={wide}>
        {category?.slug ? (
          <Breadcrumbs
            locale={locale}
            crumbs={[
              { label: category.title ?? '', href: categoryPath(locale, category.slug) },
              { label: article.headline ?? '' },
            ]}
          />
        ) : null}

        {spec.hero === 'lead' ? hero : null}

        <header className={spec.hero === 'lead' ? '' : 'mt-4'}>
          {article.isBreaking ? (
            <p className="mb-2 inline-block rounded-sm bg-[var(--color-breaking)] px-2 py-0.5 text-xs font-bold text-[var(--color-on-brand)] uppercase">
              {d('breaking')}
            </p>
          ) : null}

          {/*
          The kicker names the register before the headline is read — whether
          this is the masthead arguing, a reporter explaining, or somebody being
          questioned. Suppressed on straight reports, where "NEWS" above a news
          story tells a reader nothing they did not already assume.
        */}
          {spec.showKicker && kicker ? (
            <p className="mb-2 font-[family-name:var(--font-mono)] text-xs tracking-widest text-[var(--color-brand)] uppercase">
              {kicker}
            </p>
          ) : null}

          {heading}

          {article.subheadline ? <p className={spec.standfirst}>{article.subheadline}</p> : null}

          <div className="mt-5">
            <Byline article={article} locale={locale} />
          </div>
        </header>

        {spec.hero === 'after' ? hero : null}
      </div>

      <div className={narrow}>
        {article.correction?.hasCorrection && article.correction.note ? (
          <aside
            aria-label={d('correction')}
            className="mt-6 rounded-md border-l-4 border-[var(--color-brand)] bg-[var(--color-surface-sunken)] p-4"
          >
            <p className="text-sm font-bold uppercase">{d('correction')}</p>
            <p className="mt-1 text-sm">{article.correction.note}</p>
            {article.correction.correctedAt ? (
              <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                <time dateTime={isoDate(article.correction.correctedAt)}>
                  {formatDate(article.correction.correctedAt, locale)}
                </time>
              </p>
            ) : null}
          </aside>
        ) : null}

        <RichText
          data={article.body}
          className={`prose-article ${spec.prose} mt-8 text-lg leading-relaxed`}
        />

        {/*
        After the body, not inside it. Interrupting the story mid-paragraph is
        the placement readers most object to, and it would also mean the ad
        moving whenever an editor adds a paragraph.

        The category is passed through so a section-targeted booking can match,
        and the article id seeds rotation so two stories in the same section do
        not show the identical creative.
      */}
        <AdSlot
          placement="in-article"
          locale={locale}
          categoryId={category?.id ?? null}
          pageKey={`article-${String(article.id)}`}
        />

        {tags.length > 0 ? (
          <section aria-label={d('tags')} className="mt-10">
            <p className="mb-2 text-sm font-semibold uppercase">{d('tags')}</p>
            <ul className="flex flex-wrap gap-2">
              {tags.map((tag) =>
                tag.slug ? (
                  <li key={tag.id}>
                    <Link
                      href={tagPath(locale, tag.slug)}
                      className="inline-flex min-h-9 items-center rounded-full border border-[var(--color-rule)] px-3 text-sm hover:border-[var(--color-brand)]"
                    >
                      {tag.title}
                    </Link>
                  </li>
                ) : null,
              )}
            </ul>
          </section>
        ) : null}

        {/*
          Sharing, and the thing a desk actually posts to Facebook. The card is
          built in the reader's browser from what is already on this page, so it
          sits beside the share row rather than anywhere more ceremonious.
        */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--color-rule)] pt-6">
          <ShareLinks url={shareUrl} title={article.headline ?? ''} locale={locale} />
          <PhotoCard
            headline={article.headline ?? ''}
            subheadline={article.subheadline ?? null}
            category={category?.title ?? null}
            byline={cardByline}
            imageUrl={heroUrl}
            logoUrl={logoAsset?.url ?? null}
            siteName={siteName}
            locale={locale}
          />
        </div>
      </div>
    </>
  )
}
