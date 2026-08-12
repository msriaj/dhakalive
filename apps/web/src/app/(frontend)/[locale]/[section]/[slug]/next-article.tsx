'use server'

import type { ReactNode } from 'react'

import { isPublicLocale } from '@dhakalive/config'

import { ArticleBody } from '../../../../../components/ArticleBody'
import { getNextArticle } from '../../../../../lib/queries/articles'
import { articlePath } from '../../../../../lib/routes'

/**
 * Loads the story after the one on screen, already rendered.
 *
 * A Server Action returning JSX rather than an endpoint returning JSON or HTML.
 * The body is Lexical, and rendering it on the client would mean shipping the
 * converter, the upload renderer and `next/image`'s server half to every reader
 * — for a feature most of them will never trigger. Returning the rendered tree
 * keeps all of that on the server and keeps the streamed story identical to the
 * first one, because it is the same component.
 */
export interface NextArticle {
  /** The rendered story. */
  node: ReactNode
  /** Its canonical path, so the address bar can follow the reader down. */
  path: string
  title: string
  /** Cursor for the story after this one, or null at the end of the archive. */
  cursor: string | null
  id: number
}

export async function loadNextArticle(input: {
  locale: string
  /** `publishedAt` of the last story shown. */
  cursor: string
  /** Everything already on the page, so a shared timestamp cannot repeat one. */
  seen: number[]
}): Promise<NextArticle | null> {
  if (!isPublicLocale(input.locale)) return null

  /*
   * Bounded on the way in. `seen` arrives from the browser and is the only
   * unbounded input here; an oversized array would become an equally oversized
   * `NOT IN (…)`. The cap is well above what the stream can legitimately reach.
   */
  const seen = input.seen.filter((id) => Number.isInteger(id)).slice(0, 50)

  const article = await getNextArticle(input.cursor, input.locale, seen)
  if (!article?.slug) return null

  const category =
    typeof article.primaryCategory === 'object' && article.primaryCategory !== null
      ? article.primaryCategory
      : null
  if (!category?.slug) return null

  return {
    node: <ArticleBody article={article} locale={input.locale} headingLevel={2} priority={false} />,
    path: articlePath(input.locale, category.slug, article.slug),
    title: article.headline ?? '',
    cursor: article.publishedAt ?? null,
    id: article.id,
  }
}
