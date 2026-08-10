import { can, canAny, isSameUser, type AuthUser, type Capability } from '@dhakalive/core'
import type { Access, FieldAccess, Where } from 'payload'

/**
 * Bridge between Payload's access signatures and the framework-free capability
 * rules in `@dhakalive/core`.
 *
 * Every collection expresses its rules through these helpers. Nothing in a
 * collection should compare `user.roles` directly — that is exactly the pattern
 * that makes a permission model impossible to change safely.
 */

/**
 * Narrows Payload's authenticated user to the structural shape core expects.
 * Returns null for anonymous requests and for any object without an id, so a
 * malformed session can never be treated as authenticated.
 */
export function toAuthUser(user: unknown): AuthUser | null {
  if (!user || typeof user !== 'object') return null
  const candidate = user as { id?: unknown; roles?: unknown }
  if (typeof candidate.id !== 'string' && typeof candidate.id !== 'number') return null

  return {
    id: candidate.id,
    roles: Array.isArray(candidate.roles) ? (candidate.roles as AuthUser['roles']) : [],
  }
}

export const authenticated: Access = ({ req }) => toAuthUser(req.user) !== null

export const denyAll: Access = () => false

/** Grants access when the user holds the capability. */
export function hasCapability(capability: Capability): Access {
  return ({ req }) => can(toAuthUser(req.user), capability)
}

/** Grants access when the user holds at least one of the capabilities. */
export function hasAnyCapability(...capabilities: readonly Capability[]): Access {
  return ({ req }) => canAny(toAuthUser(req.user), ...capabilities)
}

export function fieldHasCapability(capability: Capability): FieldAccess {
  return ({ req }) => can(toAuthUser(req.user), capability)
}

/**
 * Full access with `.any`, otherwise a query constraint limiting results to the
 * user's own documents.
 *
 * Returning a `Where` rather than filtering in the UI is the whole point:
 * Payload applies it identically to REST, GraphQL, the Local API and the admin
 * list view. A UI-only filter would leave the direct API request wide open.
 */
export function ownDocumentsOnly(options: {
  anyCapability: Capability
  ownCapability: Capability
  ownerField: string
}): Access {
  return ({ req }) => {
    const user = toAuthUser(req.user)
    if (!user) return false
    if (can(user, options.anyCapability)) return true
    if (!can(user, options.ownCapability)) return false

    return { [options.ownerField]: { equals: user.id } } satisfies Where
  }
}

/**
 * Access to a user record: your own, or anyone's with `users:manage`.
 *
 * Rank enforcement does not belong here — Payload's access callbacks receive an
 * id but not the target document, so the target's roles are unknown at this
 * point. The rank rules run in the collection's `beforeChange` / `beforeDelete`
 * hooks, where the persisted document is available.
 */
export const selfOrUserManager: Access = ({ req, id }) => {
  const user = toAuthUser(req.user)
  if (!user) return false
  if (can(user, 'users:manage')) return true

  if (id !== undefined) return isSameUser(user, id)
  return { id: { equals: user.id } } satisfies Where
}
