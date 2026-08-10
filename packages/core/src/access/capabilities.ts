import { ROLES, type Role } from './roles.js'

/**
 * Every permission the platform can grant.
 *
 * Access rules check capabilities, never roles. `if (user.role === 'editor')`
 * scattered through collections is what makes a permission model impossible to
 * change later; a capability check is one lookup against this table.
 *
 * `.own` / `.any` suffixes distinguish "acting on your own document" from
 * "acting on anyone's". A role holding only `.own` still needs a query
 * constraint to enforce it — see `ownershipConstraint` in the access layer.
 */
export const CAPABILITIES = [
  // Articles
  'article:create',
  'article:read.own',
  'article:read.any',
  'article:update.own',
  'article:update.any',
  'article:delete.own',
  'article:delete.any',
  'article:submit',
  'article:review',
  'article:approve',
  'article:schedule',
  'article:publish',
  'article:unpublish',
  'article:archive',

  // Taxonomy and people
  'taxonomy:manage',
  'author:manage',

  // Media
  'media:upload',
  'media:manage.any',

  // Live blogs
  'liveblog:manage.own',
  'liveblog:manage.any',

  // Commercial and routing
  'ads:manage',
  'redirect:manage',

  // Globals — editorial (homepage, ticker) vs system (site settings, SEO defaults)
  'globals:manage.editorial',
  'globals:manage.system',

  // Administration
  'users:manage',
  'audit:read',
  'audit:delete',
] as const

export type Capability = (typeof CAPABILITIES)[number]

/**
 * Capabilities added at each rank. The effective set for a role is this entry
 * plus every entry below it — see `capabilitiesForRole`.
 *
 * Expressed as increments rather than full sets so that a role can never
 * accidentally be granted less than the role beneath it. `capabilities.test.ts`
 * asserts that monotonicity holds.
 */
const CAPABILITY_GRANTS: Readonly<Record<Role, readonly Capability[]>> = {
  contributor: [
    'article:create',
    'article:read.own',
    'article:update.own',
    'article:submit',
    'media:upload',
  ],

  reporter: ['article:delete.own', 'liveblog:manage.own'],

  editor: [
    'article:read.any',
    'article:update.any',
    'article:review',
    'article:archive',
    'taxonomy:manage',
    'author:manage',
    'media:manage.any',
    'liveblog:manage.any',
    'globals:manage.editorial',
  ],

  publisher: [
    'article:approve',
    'article:schedule',
    'article:publish',
    'article:unpublish',
    'ads:manage',
    'redirect:manage',
  ],

  // Deleting an article is not an editorial action — `article:archive` is the
  // reversible path editors use. Hard delete stays with administrators.
  admin: ['article:delete.any', 'globals:manage.system', 'users:manage', 'audit:read'],

  // Audit records are append-only for everyone else, including admins.
  'super-admin': ['audit:delete'],
}

/** Roles in ascending privilege order — the accumulation order for grants. */
const ROLE_ORDER: readonly Role[] = ROLES

const CAPABILITIES_BY_ROLE: Readonly<Record<Role, ReadonlySet<Capability>>> = (() => {
  const table = {} as Record<Role, ReadonlySet<Capability>>
  const accumulated = new Set<Capability>()

  for (const role of ROLE_ORDER) {
    for (const capability of CAPABILITY_GRANTS[role]) accumulated.add(capability)
    table[role] = new Set(accumulated)
  }

  return table
})()

export function capabilitiesForRole(role: Role): ReadonlySet<Capability> {
  return CAPABILITIES_BY_ROLE[role]
}

/** Union of the capabilities granted by every role the user holds. */
export function capabilitiesForRoles(roles: readonly Role[]): ReadonlySet<Capability> {
  const result = new Set<Capability>()
  for (const role of roles) {
    for (const capability of CAPABILITIES_BY_ROLE[role]) result.add(capability)
  }
  return result
}

export function roleHasCapability(role: Role, capability: Capability): boolean {
  return CAPABILITIES_BY_ROLE[role].has(capability)
}
