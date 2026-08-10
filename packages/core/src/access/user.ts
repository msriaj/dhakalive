import { capabilitiesForRoles, type Capability } from './capabilities.js'
import { ROLE_RANK, toRoles, type Role } from './roles.js'

/**
 * Structural shape of an authenticated user.
 *
 * Deliberately minimal and framework-free: Payload's generated `User` type
 * satisfies it, and so does a plain object in a test. Nothing in this package
 * may import Payload.
 */
export interface AuthUser {
  id: string | number
  roles?: readonly Role[] | null
}

const MAX_RANK = ROLE_RANK['super-admin']

export function rolesOf(user: AuthUser | null | undefined): Role[] {
  return toRoles(user?.roles)
}

export function capabilitiesOf(user: AuthUser | null | undefined): ReadonlySet<Capability> {
  return capabilitiesForRoles(rolesOf(user))
}

/** The single check every access rule should be written in terms of. */
export function can(user: AuthUser | null | undefined, capability: Capability): boolean {
  return capabilitiesOf(user).has(capability)
}

export function canAny(
  user: AuthUser | null | undefined,
  ...capabilities: readonly Capability[]
): boolean {
  const held = capabilitiesOf(user)
  return capabilities.some((capability) => held.has(capability))
}

export function canAll(
  user: AuthUser | null | undefined,
  ...capabilities: readonly Capability[]
): boolean {
  const held = capabilitiesOf(user)
  return capabilities.every((capability) => held.has(capability))
}

/** Highest rank among the user's roles; 0 for anonymous or role-less users. */
export function effectiveRank(user: AuthUser | null | undefined): number {
  return rolesOf(user).reduce((highest, role) => Math.max(highest, ROLE_RANK[role]), 0)
}

export function isSuperAdmin(user: AuthUser | null | undefined): boolean {
  return rolesOf(user).includes('super-admin')
}

/**
 * Compares ids across the string/number boundary. Postgres ids arrive as
 * numbers from the database but as strings through query parameters, and an
 * `===` mismatch here would silently deny a user access to their own document.
 */
export function isSameUser(
  a: AuthUser | string | number | null | undefined,
  b: AuthUser | string | number | null | undefined,
): boolean {
  const idOf = (value: typeof a): string | null => {
    if (value === null || value === undefined) return null
    if (typeof value === 'object') return String(value.id)
    return String(value)
  }

  const left = idOf(a)
  const right = idOf(b)
  return left !== null && right !== null && left === right
}

/**
 * May the actor administer this user at all (edit profile, reset, delete)?
 *
 * Strict rank inequality, with one deliberate exception: a super-admin may act
 * on another super-admin. Without it the platform would have no in-app way to
 * revoke a compromised top-level account. Acting on *yourself* is handled by the
 * caller — profile self-service is allowed, role self-service is not.
 */
export function canManageUser(
  actor: AuthUser | null | undefined,
  target: AuthUser | null | undefined,
): boolean {
  if (!actor || !target) return false
  if (!can(actor, 'users:manage')) return false

  const actorRank = effectiveRank(actor)
  if (actorRank >= MAX_RANK) return true

  return effectiveRank(target) < actorRank
}

/** May the actor grant or revoke this specific role? */
export function canAssignRole(actor: AuthUser | null | undefined, role: Role): boolean {
  if (!can(actor, 'users:manage')) return false

  const actorRank = effectiveRank(actor)
  // Only a super-admin may confer super-admin; everyone else is capped strictly
  // below their own rank, so no one can create a peer or a superior.
  return actorRank >= MAX_RANK ? ROLE_RANK[role] <= actorRank : ROLE_RANK[role] < actorRank
}

export type RoleAssignmentResult = { ok: true } | { ok: false; reason: string }

/**
 * Validates a change to a user's roles.
 *
 * Checks the *difference* rather than the resulting set, so an admin editing a
 * peer's unrelated profile field is not blocked by roles they could not have
 * granted in the first place.
 */
export function validateRoleAssignment(input: {
  actor: AuthUser | null | undefined
  target: AuthUser | null | undefined
  nextRoles: readonly Role[]
  currentRoles?: readonly Role[]
}): RoleAssignmentResult {
  const { actor, target, nextRoles } = input
  const currentRoles = input.currentRoles ?? rolesOf(target)

  if (!actor) return { ok: false, reason: 'Authentication required to change roles' }

  const next = [...new Set(toRoles(nextRoles))]
  if (next.length !== nextRoles.length) {
    return { ok: false, reason: 'Roles contain an unknown or duplicate value' }
  }
  if (next.length === 0) return { ok: false, reason: 'A user must have at least one role' }

  const current = toRoles(currentRoles)
  const changed = [
    ...next.filter((role) => !current.includes(role)),
    ...current.filter((role) => !next.includes(role)),
  ]

  // No change to roles — nothing to authorise.
  if (changed.length === 0) return { ok: true }

  if (!can(actor, 'users:manage')) {
    return { ok: false, reason: 'You are not permitted to change user roles' }
  }

  // Self-escalation defence. Applies to every rank including super-admin: an
  // account takeover must not be able to widen its own permissions, and this
  // also prevents an administrator locking themselves out by accident.
  if (isSameUser(actor, target)) {
    return { ok: false, reason: 'You cannot change your own roles' }
  }

  if (!canManageUser(actor, target)) {
    return { ok: false, reason: 'You cannot modify a user at or above your own role level' }
  }

  for (const role of changed) {
    if (!canAssignRole(actor, role)) {
      return { ok: false, reason: `You are not permitted to grant or revoke the "${role}" role` }
    }
  }

  return { ok: true }
}
