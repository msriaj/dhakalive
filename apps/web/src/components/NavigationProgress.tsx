'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import { startsNavigation } from '../lib/navigation/link-intent'

/**
 * Feedback that a click was heard.
 *
 * Every page on this site is rendered on the server, so between the click and
 * the new page there is a gap the reader cannot see: nothing moves, and on a
 * phone on a slow connection the honest conclusion is that the tap missed. They
 * tap again. This puts a pale wash and a spinner over the page for the length
 * of that gap.
 *
 * The App Router removed the router events the Pages Router had, so the start
 * of a navigation is inferred from clicks — see lib/navigation/link-intent.ts,
 * which holds the judgement about which clicks count — and the end from the
 * path or query actually changing.
 */

/**
 * How long a navigation may take before the reader is told anything.
 *
 * A cached page arrives in tens of milliseconds, and flashing a veil over every
 * one of those is worse than showing nothing: it reads as jank on exactly the
 * navigations that went well. This sits past the point where a transition stops
 * feeling instant, so the indicator only appears when there is genuinely a wait.
 */
const SHOW_DELAY_MS = 150

/**
 * The escape hatch.
 *
 * A navigation can end without the URL ever changing — a redirect back to where
 * we were, a route that throws, a dropped connection. Without a ceiling the
 * wash would stay until the next click. Ten seconds is far past any real
 * navigation here and still short enough not to feel broken.
 */
const MAX_VISIBLE_MS = 10_000

export function NavigationProgress({ label }: { label: string }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  /**
   * The URL as the reader currently sees it.
   *
   * The query belongs in the key as much as the path: pagination moves
   * `?page=` while the path stays put, and a key that ignored it would leave
   * the wash sitting over every page-two click.
   */
  const currentKey = `${pathname}?${searchParams}`

  /**
   * The URL we were on when the click happened, or null if nothing is pending.
   *
   * State rather than a ref because the render below reads it, and a ref read
   * during render is not reactive: the wash would keep rendering until some
   * other change happened to re-render the component.
   */
  const [startedAt, setStartedAt] = useState<string | null>(null)
  const [armed, setArmed] = useState(false)

  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimers = useCallback(() => {
    if (showTimer.current) clearTimeout(showTimer.current)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    showTimer.current = null
    hideTimer.current = null
  }, [])

  /**
   * Derived, not stored, and that is what makes the end of a navigation free.
   *
   * While the new page is being fetched the URL is still the old one, so this
   * key still matches where the click happened. The moment the router commits,
   * the key changes and the wash stops rendering — no effect, no state to reset,
   * and no way for the two to fall out of step.
   */
  const visible = armed && startedAt === currentKey

  /** Nothing is pending once the URL has moved; the timers have no work left. */
  useEffect(() => {
    clearTimers()
  }, [currentKey, clearTimers])

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const anchor = (event.target as Element | null)?.closest?.('a')
      if (!anchor) return

      const started = startsNavigation({
        href: anchor.getAttribute('href') ? anchor.href : null,
        currentUrl: window.location.href,
        target: anchor.getAttribute('target'),
        download: anchor.hasAttribute('download'),
        button: event.button,
        modifierKey: event.metaKey || event.ctrlKey || event.shiftKey || event.altKey,
        defaultPrevented: event.defaultPrevented,
      })
      if (!started) return

      clearTimers()
      setStartedAt(currentKey)
      setArmed(false)
      showTimer.current = setTimeout(() => setArmed(true), SHOW_DELAY_MS)
      hideTimer.current = setTimeout(() => setArmed(false), MAX_VISIBLE_MS)
    }

    /**
     * Capture phase, and it has to be.
     *
     * The bubble phase looks more correct — every other handler has run, so
     * `defaultPrevented` tells you whether the click was already dealt with —
     * and it is exactly wrong here. `next/link` calls `preventDefault()` as the
     * *mechanism* for client-side navigation, so by the time a bubble listener
     * sees a genuine in-app navigation the flag is already true. Measured
     * against production: bubble reported `defaultPrevented: true` and capture
     * `false` for the same click on a section link, and the first version of
     * this component consequently rejected every navigation on the site and
     * never once showed.
     *
     * Running first costs the `defaultPrevented` signal for handlers that have
     * not run yet, which is a smaller loss than it sounds: an anchor that gets
     * cancelled without navigating is almost always `href="#"` or a `javascript:`
     * URL, and the predicate already refuses both — the first as a link to the
     * URL we are on, the second by scheme.
     */
    document.addEventListener('click', onClick, true)
    return () => {
      document.removeEventListener('click', onClick, true)
      clearTimers()
    }
  }, [clearTimers, currentKey])

  /**
   * A reader who goes back mid-navigation must not find the wash still there.
   * The effect above covers most cases, but `popstate` returning to the same
   * URL would not re-run it.
   */
  useEffect(() => {
    function onPopState() {
      clearTimers()
      setArmed(false)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [clearTimers])

  return (
    <>
      {visible ? (
        <div
          /**
           * `pointer-events-none`, so this never traps anybody. Swallowing
           * clicks would also stop the double-tap this exists to prevent, but a
           * navigation that silently failed would leave the page unusable until
           * the timeout — a worse failure than the one being fixed.
           *
           * The wash is decoration and the live region below carries the
           * meaning, so a screen reader hears the label rather than a white box.
           */
          className="pointer-events-none fixed inset-0 z-[100] flex items-start justify-center bg-white/55 pt-[22vh]"
          aria-hidden="true"
        >
          <svg
            className="h-9 w-9 animate-spin text-[var(--color-brand)]"
            viewBox="0 0 24 24"
            fill="none"
          >
            {/* The full ring, faint: it gives the moving arc something to travel. */}
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeOpacity="0.2"
              strokeWidth="3"
            />
            <path
              d="M22 12a10 10 0 0 0-10-10"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
        </div>
      ) : null}

      {/*
        Always mounted, and empty until there is something to say. A live region
        created at the same moment as its text is not reliably announced — the
        region has to be there first for the change to be a change.
      */}
      <div role="status" aria-live="polite" className="sr-only">
        {visible ? label : ''}
      </div>
    </>
  )
}
