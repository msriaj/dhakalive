/**
 * Redirect paths: normalising them, and deciding which targets are safe.
 *
 * Pure, because both halves are security-relevant and neither is obvious. A
 * redirect table is an open-redirect vector by construction — it exists to send
 * readers somewhere else — and normalisation decides whether two spellings of
 * the same URL are one entry or two.
 */

/**
 * How many redirects may chain before the platform gives up.
 *
 * Browsers stop somewhere around twenty; stopping much earlier means a
 * misconfigured chain surfaces as a logged warning here rather than as
 * `ERR_TOO_MANY_REDIRECTS` in a reader's browser.
 */
export const MAX_REDIRECT_HOPS = 5

/**
 * Canonical form of a site-relative path.
 *
 * - Percent-encoding is decoded, so `/bn/%E0%A6%AC` and `/bn/ব` are one entry.
 *   Bengali slugs are percent-encoded by every browser, and storing both forms
 *   would mean half the redirects silently never match.
 * - The query string and fragment are dropped. A redirect is keyed on the path;
 *   preserving the query is the *responder's* job, not the table's.
 * - A trailing slash is removed, except on the root.
 * - Case is preserved. Slugs are case-sensitive in this platform's routing, and
 *   lowercasing here would create matches the router would not make.
 *
 * Returns null for anything that is not a usable site-relative path, including
 * absolute URLs and protocol-relative ones.
 */
export function normaliseRedirectPath(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (trimmed.length === 0) return null

  // `//evil.example` is protocol-relative: it looks like a path and is not one.
  if (trimmed.startsWith('//')) return null
  if (!trimmed.startsWith('/')) return null

  const withoutFragment = trimmed.split('#')[0] ?? ''
  const withoutQuery = withoutFragment.split('?')[0] ?? ''
  if (withoutQuery.length === 0) return null

  let decoded: string
  try {
    decoded = decodeURIComponent(withoutQuery)
  } catch {
    // A malformed escape sequence. Keeping the raw form is better than throwing:
    // the entry simply matches only its literal spelling.
    decoded = withoutQuery
  }

  // Collapse repeated slashes, which routing treats as one.
  const collapsed = decoded.replace(/\/{2,}/g, '/')

  if (collapsed === '/') return '/'
  return collapsed.endsWith('/') ? collapsed.slice(0, -1) : collapsed
}

export type RedirectTarget = { kind: 'internal'; path: string } | { kind: 'external'; url: string }

/**
 * Validates a redirect destination.
 *
 * Internal paths are normalised. External URLs are allowed only over http or
 * https and only when the host is explicitly permitted — a redirect table an
 * editor can write to is otherwise a phishing tool with the publication's
 * domain in front of it, which is exactly what makes open redirects valuable to
 * an attacker.
 *
 * `javascript:` and `data:` are rejected by the protocol check rather than by a
 * denylist, so a scheme nobody has thought of yet is refused by default.
 */
export function parseRedirectTarget(
  value: unknown,
  options: { allowedHosts?: readonly string[] } = {},
): RedirectTarget | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length === 0) return null

  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    const path = normaliseRedirectPath(trimmed)
    return path ? { kind: 'internal', path } : null
  }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

  const allowed = options.allowedHosts ?? []
  if (!allowed.some((host) => host.toLowerCase() === url.host.toLowerCase())) return null

  return { kind: 'external', url: url.toString() }
}

/**
 * How long a redirect is meant to last.
 *
 * Deliberately two values rather than a status code. Next's `redirect()` and
 * `permanentRedirect()` emit 307 and 308 — the method-preserving pair — and
 * offering an editor a choice of 301 or 302 would have been a field whose value
 * was quietly ignored. 308 is treated by search engines exactly as 301 is, so
 * nothing is lost but the fiction.
 */
export const REDIRECT_PERMANENCE = ['permanent', 'temporary'] as const

export type RedirectPermanence = (typeof REDIRECT_PERMANENCE)[number]

/** The status code each kind actually produces, for documentation and tests. */
export const REDIRECT_STATUS: Readonly<Record<RedirectPermanence, 308 | 307>> = {
  permanent: 308,
  temporary: 307,
}

export function isRedirectPermanence(value: unknown): value is RedirectPermanence {
  return typeof value === 'string' && (REDIRECT_PERMANENCE as readonly string[]).includes(value)
}

/**
 * Walks a chain of redirects to its destination.
 *
 * Takes a synchronous lookup so the loop logic can be tested without a
 * database; the caller materialises the map or closes over an async cache.
 *
 * Detects both a cycle (a path already visited) and an over-long chain, and
 * reports which occurred — the two need different fixes, and "redirect did not
 * work" is not enough to act on.
 */
export type ChainResult =
  | { status: 'resolved'; path: string; hops: number }
  | { status: 'none' }
  | { status: 'loop'; path: string; hops: number }
  | { status: 'too-long'; path: string; hops: number }

export function followRedirectChain(
  start: string,
  lookup: (path: string) => string | null,
  maxHops: number = MAX_REDIRECT_HOPS,
): ChainResult {
  const visited = new Set<string>([start])
  let current = start
  let hops = 0

  for (;;) {
    const next = lookup(current)
    if (next === null) {
      return hops === 0 ? { status: 'none' } : { status: 'resolved', path: current, hops }
    }

    hops += 1

    if (visited.has(next)) return { status: 'loop', path: next, hops }
    if (hops > maxHops) return { status: 'too-long', path: next, hops }

    visited.add(next)
    current = next
  }
}
