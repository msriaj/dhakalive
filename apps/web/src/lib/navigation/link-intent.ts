/**
 * Whether a click is about to navigate this document somewhere new.
 *
 * The App Router exposes no router events, so a global loading indicator has to
 * infer that a navigation started by watching clicks. Getting the predicate
 * wrong is worse than having no indicator: a false positive leaves a white wash
 * over a page that was never going anywhere, and the reader has to wait out a
 * timeout to be rid of it.
 *
 * Kept as a pure function so it can be tested. The component that uses it
 * cannot be — the suite runs in Node with no DOM — and this is where all the
 * judgement lives.
 */

export interface LinkIntent {
  /** Resolved href of the anchor, absolute. */
  href: string | null
  /** The document's current URL. */
  currentUrl: string
  /** `target` on the anchor, if any. */
  target?: string | null
  /** Anchors carrying `download` save a file; the page stays put. */
  download?: boolean
  /** Mouse button. Only the primary button navigates in place. */
  button?: number
  /** Ctrl/Cmd/Shift/Alt all open elsewhere or do something other than navigate. */
  modifierKey?: boolean
  /** A handler upstream already called `preventDefault`. */
  defaultPrevented?: boolean
}

export function startsNavigation(intent: LinkIntent): boolean {
  if (intent.defaultPrevented) return false
  if (intent.download) return false
  if (intent.button !== undefined && intent.button !== 0) return false
  if (intent.modifierKey) return false

  // `_self` is the default and navigates here; any other target does not.
  if (intent.target && intent.target !== '_self') return false
  if (!intent.href) return false

  let next: URL
  let current: URL
  try {
    current = new URL(intent.currentUrl)
    next = new URL(intent.href, intent.currentUrl)
  } catch {
    return false
  }

  /**
   * Anything off this origin leaves the app entirely. The browser shows its own
   * progress for that, and our overlay would be left behind on a page the
   * reader may well come back to.
   */
  if (next.origin !== current.origin) return false

  // mailto:, tel:, and friends never reach here as http(s) — but a same-origin
  // check passes for `javascript:` in some browsers, so be explicit.
  if (next.protocol !== 'http:' && next.protocol !== 'https:') return false

  /**
   * Same path and query means an in-page jump or a no-op. The App Router does
   * not re-render for it, so nothing would ever clear the indicator.
   */
  if (next.pathname === current.pathname && next.search === current.search) return false

  return true
}
