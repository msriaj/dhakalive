'use client'

import { useEffect, useState } from 'react'

import type { Locale } from '@dhakalive/config'

import { dictionary } from '../lib/dictionary'
import { FacebookIcon, LinkIcon, WhatsAppIcon, XIcon, LinkedInIcon } from './icons'

/**
 * Social sharing.
 *
 * Plain links to each network's share endpoint — no third-party SDKs, so no
 * tracking scripts, no layout shift and nothing to load before the article is
 * readable. Each link carries its own accessible name; a row of identical
 * "Share" links is useless to a screen-reader user.
 *
 * The names used to be the buttons: a row reading "Facebook X WhatsApp
 * LinkedIn" in the site's body face, which reads as a list of links rather than
 * as a control, and which grew wider in Bengali than the column it sat in. The
 * marks are recognised without being read, and they are the same drawings the
 * footer uses.
 */
const TARGETS = [
  {
    name: 'Facebook',
    Icon: FacebookIcon,
    href: (url: string) => `https://www.facebook.com/sharer/sharer.php?u=${url}`,
  },
  {
    name: 'X',
    Icon: XIcon,
    href: (url: string, title: string) =>
      `https://twitter.com/intent/tweet?url=${url}&text=${title}`,
  },
  {
    name: 'WhatsApp',
    Icon: WhatsAppIcon,
    href: (url: string, title: string) => `https://wa.me/?text=${title}%20${url}`,
  },
  {
    name: 'LinkedIn',
    Icon: LinkedInIcon,
    href: (url: string) => `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
  },
] as const

const CONTROL =
  'inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-rule)] text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]'

export function ShareLinks({ url, title, locale }: { url: string; title: string; locale: Locale }) {
  const d = dictionary(locale)
  const encodedUrl = encodeURIComponent(url)
  const encodedTitle = encodeURIComponent(title)

  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => {
      setCopied(false)
    }, 2000)
    return () => {
      clearTimeout(timer)
    }
  }, [copied])

  /**
   * Copy is the share that always works.
   *
   * Every network here opens a popup a reader may not be signed into, and the
   * one thing they can always do with a story is paste it somewhere. It is a
   * button rather than a link because it goes nowhere.
   */
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      // A denied clipboard permission is the reader's decision, not a fault to
      // report back to them; the URL is in the address bar either way.
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm font-semibold tracking-wide uppercase">{d('share')}</span>

      <ul className="flex flex-wrap items-center gap-2">
        {TARGETS.map((target) => (
          <li key={target.name}>
            <a
              href={target.href(encodedUrl, encodedTitle)}
              rel="noopener noreferrer"
              target="_blank"
              className={CONTROL}
            >
              <span className="sr-only">{`${d('shareOn')} ${target.name}`}</span>
              <target.Icon size={18} />
            </a>
          </li>
        ))}

        <li>
          <button type="button" onClick={() => void copy()} className={CONTROL}>
            {/*
              The label changes to confirm the copy, and `aria-live` on the
              wrapper is deliberately absent: the button's own accessible name
              changing is what a screen reader announces, without a second
              region competing to say the same thing.
            */}
            <span className="sr-only">{copied ? d('linkCopied') : d('copyLink')}</span>
            <LinkIcon size={18} />
          </button>
        </li>
      </ul>

      {copied ? <span className="text-sm text-[var(--color-brand)]">{d('linkCopied')}</span> : null}
    </div>
  )
}
