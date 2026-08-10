'use client'

import { useEffect } from 'react'

import { DEFAULT_LOCALE } from '@dhakalive/config'

import { dictionary } from '../../../lib/dictionary'

/**
 * Error boundary for the public site.
 *
 * Must be a client component — that is how React error boundaries work. The
 * `digest` is the only thing shown to the reader: the real error is logged
 * server-side, and surfacing a stack trace on a public page leaks internals.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const d = dictionary(DEFAULT_LOCALE)

  useEffect(() => {
    // Phase 8 forwards this to the error-tracking service.
    console.error('Public site error', error.digest ?? error.message)
  }, [error])

  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <h1 className="text-2xl font-bold">{d('errorTitle')}</h1>
      <p className="mt-3 text-[var(--color-ink-muted)]">{d('errorBody')}</p>

      {error.digest ? (
        <p className="mt-2 font-mono text-xs text-[var(--color-ink-muted)]">{error.digest}</p>
      ) : null}

      <button
        type="button"
        onClick={reset}
        className="mt-8 inline-flex min-h-11 items-center rounded-md bg-[var(--color-brand)] px-5 font-medium text-white"
      >
        {d('tryAgain')}
      </button>
    </div>
  )
}
