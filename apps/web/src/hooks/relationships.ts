import type { PayloadRequest } from 'payload'

/**
 * Reading relationships out of hook arguments.
 *
 * Payload does not populate `previousDoc` to the same depth as `doc`: the
 * current document arrives with its category resolved, while the previous one
 * carries a bare id. Code that reads `previousDoc.primaryCategory.slug` gets
 * `undefined` and, if it treats that as "no previous category", silently stops
 * doing whatever it was there to do — which is how a story moved between
 * sections leaves its old URL both uncached and un-redirected.
 */

export function relationshipId(value: unknown): string | number | null {
  if (typeof value === 'string' || typeof value === 'number') return value
  if (value && typeof value === 'object') {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'string' || typeof id === 'number') return id
  }
  return null
}

export function relationshipSlug(value: unknown): string | null {
  if (value && typeof value === 'object') {
    const slug = (value as { slug?: unknown }).slug
    if (typeof slug === 'string' && slug.length > 0) return slug
  }
  return null
}

/**
 * The slug of a related category, whether it arrived populated or as an id.
 *
 * `known` short-circuits the common case: when the category has not changed,
 * the populated current document already holds the slug and there is no reason
 * to query for it. A lookup happens only when a story has genuinely moved
 * section, which is rare.
 */
export async function resolveCategorySlug(
  req: PayloadRequest,
  value: unknown,
  known?: unknown,
): Promise<string | null> {
  const direct = relationshipSlug(value)
  if (direct) return direct

  const id = relationshipId(value)
  if (id === null) return null

  const knownId = relationshipId(known)
  if (knownId !== null && String(knownId) === String(id)) {
    const knownSlug = relationshipSlug(known)
    if (knownSlug) return knownSlug
  }

  const category = await req.payload.findByID({
    collection: 'categories',
    id,
    depth: 0,
    req,
    locale: req.locale,
    // A category that has since been deleted is not an error here; it simply
    // means the old URL cannot be reconstructed.
    disableErrors: true,
    overrideAccess: true,
  })

  return relationshipSlug(category)
}
