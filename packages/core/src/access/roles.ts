/**
 * Editorial roles, ordered by privilege.
 *
 * Roles exist for humans; `Capability` is what the code checks. A role is only
 * ever a named bundle of capabilities plus a rank, so permissions can change
 * without rewriting every collection's access rules.
 */
export const ROLES = [
  'contributor',
  'reporter',
  'editor',
  'publisher',
  'admin',
  'super-admin',
] as const

export type Role = (typeof ROLES)[number]

/**
 * Rank exists for one purpose: privilege-escalation defence. It answers "may
 * this actor act on that user, or grant that role", and nothing else. Access
 * decisions are made on capabilities, never on rank.
 *
 * Gaps of 10 leave room to insert a role without renumbering.
 */
export const ROLE_RANK: Readonly<Record<Role, number>> = {
  contributor: 10,
  reporter: 20,
  editor: 30,
  publisher: 40,
  admin: 50,
  'super-admin': 60,
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

/** Filters unknown values out of a roles array coming from the database or an API body. */
export function toRoles(value: unknown): Role[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRole)
}
