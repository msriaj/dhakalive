import type { Locale } from '@dhakalive/config'

import { dictionary } from '../lib/dictionary'

/**
 * Social sharing.
 *
 * Plain links to each network's share endpoint — no third-party SDKs, so no
 * tracking scripts, no layout shift and nothing to load before the article is
 * readable. Each link carries its own accessible name; a row of identical
 * "Share" links is useless to a screen-reader user.
 */
export function ShareLinks({ url, title, locale }: { url: string; title: string; locale: Locale }) {
  const d = dictionary(locale)
  const encodedUrl = encodeURIComponent(url)
  const encodedTitle = encodeURIComponent(title)

  const targets = [
    { name: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` },
    { name: 'X', href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}` },
    { name: 'WhatsApp', href: `https://wa.me/?text=${encodedTitle}%20${encodedUrl}` },
    { name: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}` },
  ]

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium">{d('share')}</span>
      <ul className="flex flex-wrap gap-2">
        {targets.map((target) => (
          <li key={target.name}>
            <a
              href={target.href}
              rel="noopener noreferrer"
              target="_blank"
              className="inline-flex min-h-11 items-center rounded-md border border-[var(--color-rule)] px-3 text-sm hover:border-[var(--color-brand)]"
            >
              <span className="sr-only">{`${d('shareOn')} ${target.name}`}</span>
              <span aria-hidden="true">{target.name}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
