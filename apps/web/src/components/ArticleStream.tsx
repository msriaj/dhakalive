'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import type { Locale } from '@dhakalive/config'

import type { NextArticle } from '../app/(frontend)/[locale]/[section]/[slug]/next-article'

interface Loaded {
  id: number
  node: ReactNode
  path: string
  title: string
}

/**
 * How many stories the reader may fall into before the page stops feeding them.
 *
 * A stream with no end is a footer nobody can reach, a page that never stops
 * growing in memory, and a "back" button that returns the reader to the top of
 * an hour's scrolling. Five is enough that the feature does what it is for —
 * one more story, then another, without a decision each time — and few enough
 * that the page still ends. After that the reader is handed a link, which is a
 * decision but an honest one.
 */
const MAX_STREAMED = 5

/**
 * Appends the next story when the reader reaches the end of this one.
 *
 * The rendering happens on the server: this holds the returned trees, watches
 * two kinds of element, and does nothing else. Anything cleverer here would
 * mean a second implementation of the article layout living on the client.
 */
export function ArticleStream({
  locale,
  cursor,
  seed,
  loadNext,
  moreHref,
  moreLabel,
  nextLabel,
  loadingLabel,
  endLabel,
}: {
  locale: Locale
  /** `publishedAt` of the story already on the page. */
  cursor: string | null
  /** Its id, so the first query cannot return it again. */
  seed: number
  loadNext: (input: {
    locale: string
    cursor: string
    seen: number[]
  }) => Promise<NextArticle | null>
  moreHref: string
  moreLabel: string
  nextLabel: string
  loadingLabel: string
  endLabel: string
}) {
  const [loaded, setLoaded] = useState<Loaded[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(cursor)
  const [pending, setPending] = useState(false)
  const [ended, setEnded] = useState(cursor === null)

  const sentinel = useRef<HTMLDivElement | null>(null)

  /**
   * Whether a scroll may trigger another load.
   *
   * Disarmed the moment one fires, and rearmed only when the sentinel leaves
   * the viewport again. Appending a story rebuilds the observer, and a fresh
   * observer reports an element already in view as intersecting — without this
   * the stream would run itself to its cap the moment a reader first reached
   * the bottom, which is five articles fetched that nobody asked for.
   */
  const armed = useRef(true)

  const loadMore = useCallback(async () => {
    if (pending || ended || nextCursor === null || loaded.length >= MAX_STREAMED) return

    const from = nextCursor
    const current = loaded
    const first = seed

    setPending(true)
    try {
      const next = await loadNext({
        locale,
        cursor: from,
        seen: [first, ...current.map((entry) => entry.id)],
      })

      if (!next) {
        setEnded(true)
        return
      }

      setLoaded((entries) => [
        ...entries,
        { id: next.id, node: next.node, path: next.path, title: next.title },
      ])
      setNextCursor(next.cursor)
      if (next.cursor === null) setEnded(true)
    } catch {
      /*
       * Silent, and terminal for the stream. A reader who cannot get the next
       * story has lost nothing they asked for — the story they opened is intact
       * above — and an error banner under a finished article would be reporting
       * a failure of something they never requested.
       */
      setEnded(true)
    } finally {
      setPending(false)
    }
  }, [ended, loadNext, loaded, locale, nextCursor, pending, seed])

  useEffect(() => {
    const target = sentinel.current
    if (!target) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            armed.current = true
            continue
          }
          if (!armed.current) continue
          armed.current = false
          void loadMore()
        }
      },
      // Well before the end of the current story, so the next one is in place
      // by the time the reader gets there rather than arriving as a jolt.
      { rootMargin: '800px 0px' },
    )

    observer.observe(target)
    return () => {
      observer.disconnect()
    }
  }, [loadMore])

  /**
   * The address bar follows the reader.
   *
   * Without this, a reader four stories down copies the URL of the one they
   * opened and sends somebody else somewhere they were not. `replaceState`
   * rather than `pushState`: the browser's back button should leave the page,
   * not walk back up through every story the reader scrolled past.
   */
  useEffect(() => {
    if (loaded.length === 0) return

    const first = { path: window.location.pathname, title: document.title }
    const sections = document.querySelectorAll<HTMLElement>('[data-stream-path]')

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting)
        if (!visible) return

        const path = visible.target.getAttribute('data-stream-path') ?? first.path
        const title = visible.target.getAttribute('data-stream-title') ?? first.title
        if (window.location.pathname === path) return

        window.history.replaceState(null, '', path)
        document.title = title
      },
      // A band across the middle of the viewport: the story a reader is reading
      // is the one under their eyes, not the one whose first pixel is showing.
      { rootMargin: '-45% 0px -45% 0px' },
    )

    for (const section of sections) observer.observe(section)
    return () => {
      observer.disconnect()
    }
  }, [loaded])

  return (
    <>
      {loaded.map((entry) => (
        <article
          key={entry.id}
          data-stream-path={entry.path}
          data-stream-title={`${entry.title} — DhakaLive`}
          className="mt-16 border-t-4 border-[var(--color-rule-strong)] pt-8"
        >
          {entry.node}
        </article>
      ))}

      <div ref={sentinel} className="mt-10">
        {pending ? (
          <p aria-live="polite" className="text-center text-sm text-[var(--color-ink-muted)]">
            {loadingLabel}
          </p>
        ) : null}

        {/*
          A real control, not only a scroll trigger.
          `IntersectionObserver` never fires for a reader who navigates by
          keyboard or by "find on page", nor in a background tab, and a feature
          reachable only by dragging a scrollbar is one a screen reader user
          cannot reach at all. The observer presses this same path; the button
          is what makes it operable when the observer does not run.
        */}
        {!pending && !ended && loaded.length < MAX_STREAMED ? (
          <p className="text-center">
            <button
              type="button"
              onClick={() => void loadMore()}
              className="inline-flex min-h-11 items-center rounded-md border border-[var(--color-rule)] px-5 text-sm font-semibold hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]"
            >
              {nextLabel}
            </button>
          </p>
        ) : null}

        {/*
          The stream always ends in a link. Whether it stopped because the
          archive ran out or because it hit its own limit, a reader at the
          bottom of an infinite page needs somewhere to go that is not more
          scrolling — and a page that never ends is a footer nobody reaches.
        */}
        {ended || loaded.length >= MAX_STREAMED ? (
          <div className="mt-6 border-t border-[var(--color-rule)] pt-6 text-center">
            <p className="mb-3 text-sm text-[var(--color-ink-muted)]">{endLabel}</p>
            <Link
              href={moreHref}
              className="inline-flex min-h-11 items-center rounded-md border border-[var(--color-rule)] px-5 font-semibold hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]"
            >
              {moreLabel}
            </Link>
          </div>
        ) : null}
      </div>
    </>
  )
}
