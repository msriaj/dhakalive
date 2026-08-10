import 'server-only'

import config from '@payload-config'
import { getPayload, type Payload } from 'payload'
import { cache } from 'react'

import { DEFAULT_LOCALE, isLocale, type Locale } from '@dhakalive/config'

/**
 * Public-site data access.
 *
 * Two rules hold throughout this directory:
 *
 * 1. Queries run with `overrideAccess: false` and no user, so the collection's
 *    own access rules apply. The published-only constraint is therefore never
 *    restated here — one definition, enforced in SQL, and a public page cannot
 *    drift out of sync with it.
 *
 * 2. Every query pins an explicit `depth`. Payload's default of 2 quietly pulls
 *    whole relationship trees on listing pages; the depth needed for a card is
 *    not the depth needed for an article page.
 *
 * `server-only` makes importing any of this from a client component a build
 * error rather than a runtime data leak.
 */
export const getPayloadClient = cache(async (): Promise<Payload> => getPayload({ config }))

export function normaliseLocale(value: string | undefined): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE
}

/** Relationships arrive either as an id or as a populated document. */
export function isPopulated<T extends { id: unknown }>(value: unknown): value is T {
  return typeof value === 'object' && value !== null && 'id' in value
}

/** Narrows a relationship to its populated document, or null. */
export function populated<T extends { id: unknown }>(value: unknown): T | null {
  return isPopulated<T>(value) ? value : null
}

/** Narrows a hasMany relationship to the entries that came back populated. */
export function populatedList<T extends { id: unknown }>(value: unknown): T[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is T => isPopulated<T>(entry))
}
