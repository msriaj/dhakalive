import Link from 'next/link'

/**
 * Placeholder home page. Phase 4 replaces it with the homepage assembled from
 * the Homepage global (lead story, secondary leads, category sections, ad slots).
 */
export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold tracking-tight">DhakaLive</h1>
      <p className="mt-4 text-[var(--color-ink-muted)]">
        Foundation is up. The public site is built in Phase 4.
      </p>
      <p className="mt-8">
        <Link className="text-[var(--color-brand)] underline underline-offset-4" href="/admin">
          Open the CMS
        </Link>
      </p>
    </main>
  )
}
