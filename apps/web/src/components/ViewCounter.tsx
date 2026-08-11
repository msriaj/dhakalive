'use client'

import { useEffect } from 'react'

/**
 * Tells the origin that this article was opened.
 *
 * Renders nothing. It exists because the article page is cached and served from
 * a CDN, so the render happens once for everybody — the only per-reader moment
 * left is in the browser.
 *
 * Counted once per article per session, which is the honest unit: a reader who
 * scrolls back up, follows a link and returns, or lands on the same story from
 * the stream has read it once. `sessionStorage` rather than `localStorage`,
 * because a story read again tomorrow genuinely is another read.
 */
export function ViewCounter({ articleId }: { articleId: number }) {
  useEffect(() => {
    const key = `dl:viewed:${String(articleId)}`

    try {
      if (window.sessionStorage.getItem(key)) return
      window.sessionStorage.setItem(key, '1')
    } catch {
      // Private modes and storage-blocking extensions throw rather than
      // returning null. Counting the view anyway is better than dropping it;
      // the worst case is a reader counted twice in one session.
    }

    /*
     * `keepalive` so the request survives the reader tapping straight through
     * to another story, which on a phone is most of them. Fired without waiting
     * on it: nothing on the page depends on the result, and a rejected promise
     * here would surface as an unhandled rejection in the reader's console.
     */
    void fetch('/api/view', {
      method: 'POST',
      keepalive: true,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: articleId }),
    }).catch(() => {
      // A blocked or failed beacon is a lost count, and nothing more.
    })
  }, [articleId])

  return null
}
