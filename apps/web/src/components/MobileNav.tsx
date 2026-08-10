'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type React from 'react'

/**
 * The only client component on the public site.
 *
 * Everything else renders on the server; this exists because a disclosure menu
 * genuinely needs state. Built as a native disclosure rather than a modal:
 * Escape closes it, focus returns to the trigger, and the links are already in
 * the DOM if JavaScript never loads — just visually collapsed.
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

  useEffect(() => {
    if (!isOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setIsOpen(false)
      // Returning focus to the trigger is what keeps keyboard users oriented.
      triggerRef.current?.focus()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
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
        <span className="sr-only">{isOpen ? closeLabel : openLabel}</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none">
          {isOpen ? (
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" />
          )}
        </svg>
      </button>

      <nav
        id={panelId}
        aria-label={navigationLabel}
        hidden={!isOpen}
        className="border-t border-[var(--color-rule)] py-2"
      >
        {children}
      </nav>
    </div>
  )
}
