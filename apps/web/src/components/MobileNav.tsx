'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type React from 'react'

/**
 * The only client component on the public site.
 *
 * Everything else renders on the server; this exists because a disclosure menu
 * genuinely needs state. The panel is a full-screen drawer rather than a strip
 * under the header: on a phone the navigation is the whole task while it is
 * open, and a short dropdown leaves the page visible behind it competing for
 * the same attention.
 *
 * It stays a disclosure rather than becoming a modal dialog. The links are in
 * the DOM whether or not JavaScript ever loads, Escape closes it, and focus
 * returns to the trigger — the behaviours a reader actually depends on, without
 * taking on a dialog's full focus-trap contract.
 */
export function MobileNav({
  openLabel,
  closeLabel,
  navigationLabel,
  children,
}: {
  openLabel: string
  closeLabel: string
  navigationLabel: string
  children: React.ReactNode
}) {
  const [isOpen, setIsOpen] = useState(false)
  const panelId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  const close = () => {
    setIsOpen(false)
    // Returning focus to the trigger is what keeps keyboard users oriented.
    triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!isOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setIsOpen(false)
      triggerRef.current?.focus()
    }

    document.addEventListener('keydown', onKeyDown)

    /**
     * The page behind a full-screen drawer must not scroll. Without this, a
     * swipe over the drawer scrolls the article underneath and the reader
     * closes the menu to find they have lost their place.
     */
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Focus moves into the drawer so the next Tab lands on the navigation
    // rather than continuing through the page hidden behind it.
    closeRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  return (
    <div className="md:hidden">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => {
          setIsOpen((open) => !open)
        }}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-[var(--color-rule)] px-3"
      >
        <span className="sr-only">{openLabel}</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none">
          <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" />
        </svg>
      </button>

      <nav
        id={panelId}
        aria-label={navigationLabel}
        hidden={!isOpen}
        className="fixed inset-0 z-50 flex flex-col bg-[var(--color-surface)]"
      >
        <div className="flex items-center justify-end border-b border-[var(--color-rule)] px-4 py-3">
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-[var(--color-rule)] px-3"
          >
            <span className="sr-only">{closeLabel}</span>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
        </div>

        {/*
          Scrolls independently: a long section list must not be unreachable.

          The click is caught here rather than bound to each link because the
          links are `children` — server-rendered by the header, which cannot
          hand a handler across that boundary. One listener on the container
          covers every one of them, now and whenever the menu gains more.

          Closing on navigation is not optional. The App Router keeps this
          component mounted across a route change, so without it the drawer
          stays open over the page the reader just asked for and looks like a
          tap that did nothing.

          `setIsOpen` rather than `close()`: focus belongs to the new page, not
          back on the hamburger the reader has finished with.
        */}
        <div
          className="flex-1 overflow-y-auto overscroll-contain px-4 py-2"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('a')) setIsOpen(false)
          }}
        >
          {children}
        </div>
      </nav>
    </div>
  )
}
