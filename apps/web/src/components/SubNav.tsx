'use client'

import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'

import type { Locale } from '@dhakalive/config'

import { categoryPath } from '../lib/routes'
import type { Category } from '../payload-types'

export type SubCategory = Pick<Category, 'id' | 'title' | 'slug'>

/**
 * Sub-sections, as a disclosure on both breakpoints.
 *
 * The section label stays a link and the chevron is its own control. Making the
 * whole row a button would strip the reader of the one thing they most often
 * want — going to the section itself — and making the whole row a link would
 * leave the children reachable only by hover, which a phone cannot perform.
 */

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      className={open ? 'rotate-180 transition-transform' : 'transition-transform'}
    >
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

/** Desktop: a panel under the section, opened by pointer or by keyboard. */
export function NavDropdown({
  label,
  href,
  children,
  locale,
  expandLabel,
}: {
  label: string
  href: string
  children: SubCategory[]
  locale: Locale
  expandLabel: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const panelId = useId()
  const wrapperRef = useRef<HTMLLIElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }
    /**
     * A dropdown left open while the reader works elsewhere on the page is
     * clutter obscuring the story behind it.
     */
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setIsOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [isOpen])

  return (
    <li
      ref={wrapperRef}
      className="relative"
      onPointerEnter={() => {
        setIsOpen(true)
      }}
      onPointerLeave={() => {
        setIsOpen(false)
      }}
    >
      <span className="flex items-center gap-1">
        <Link href={href} className="text-sm font-medium hover:text-[var(--color-brand)]">
          {label}
        </Link>
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={() => {
            setIsOpen((open) => !open)
          }}
          className="inline-flex items-center text-[var(--color-ink-muted)] hover:text-[var(--color-brand)]"
        >
          <span className="sr-only">{`${expandLabel} — ${label}`}</span>
          <Chevron open={isOpen} />
        </button>
      </span>

      <ul
        id={panelId}
        hidden={!isOpen}
        className="absolute start-0 top-full z-40 min-w-48 border border-[var(--color-rule)] bg-[var(--color-surface)] py-1 shadow-lg"
      >
        {children.map((child) =>
          child.slug ? (
            <li key={child.id}>
              <Link
                href={categoryPath(locale, child.slug)}
                className="block px-4 py-2 text-sm text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-brand)]"
              >
                {child.title}
              </Link>
            </li>
          ) : null,
        )}
      </ul>
    </li>
  )
}

/** Mobile drawer: the same disclosure, stacked and full width. */
export function NavAccordion({
  label,
  href,
  children,
  locale,
  expandLabel,
}: {
  label: string
  href: string
  children: SubCategory[]
  locale: Locale
  expandLabel: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const panelId = useId()

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <Link
          href={href}
          className="block flex-1 py-4 font-[family-name:var(--font-display)] text-xl font-semibold"
        >
          {label}
        </Link>
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={() => {
            setIsOpen((open) => !open)
          }}
          className="inline-flex min-h-11 min-w-11 items-center justify-center text-[var(--color-ink-muted)]"
        >
          <span className="sr-only">{`${expandLabel} — ${label}`}</span>
          <Chevron open={isOpen} />
        </button>
      </div>

      <ul id={panelId} hidden={!isOpen} className="pb-3">
        {children.map((child) =>
          child.slug ? (
            <li key={child.id}>
              <Link
                href={categoryPath(locale, child.slug)}
                className="block py-3 ps-4 text-base text-[var(--color-ink-muted)]"
              >
                {child.title}
              </Link>
            </li>
          ) : null,
        )}
      </ul>
    </div>
  )
}
