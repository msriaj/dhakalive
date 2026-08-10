import { shouldUseSecureCookies } from '@dhakalive/config'
import {
  ROLES,
  can,
  isSameUser,
  rolesOf,
  toRoles,
  validateRoleAssignment,
  type AuthUser,
  type Role,
} from '@dhakalive/core'
import type {
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
  CollectionConfig,
} from 'payload'
import { APIError, Forbidden } from 'payload'

import { hasCapability, selfOrUserManager, toAuthUser } from '../access'
import { env } from '../lib/env'

const ROLE_LABELS: Record<Role, string> = {
  contributor: 'Contributor',
  reporter: 'Reporter',
  editor: 'Editor',
  publisher: 'Publisher',
  admin: 'Administrator',
  'super-admin': 'Super administrator',
}

/** Counts users holding `super-admin`, so the last one cannot be removed. */
async function countSuperAdmins(
  payload: Parameters<CollectionBeforeChangeHook>[0]['req']['payload'],
  req: Parameters<CollectionBeforeChangeHook>[0]['req'],
  excludeId?: string | number,
): Promise<number> {
  const result = await payload.count({
    collection: 'users',
    req,
    where: excludeId
      ? { and: [{ roles: { in: ['super-admin'] } }, { id: { not_equals: excludeId } }] }
      : { roles: { in: ['super-admin'] } },
  })
  return result.totalDocs
}

/**
 * Authorises every change to `roles`.
 *
 * This runs as a hook rather than as field access because the rules compare the
 * request against the *persisted* document — which role is being added, and
 * whether the actor outranks the target. Field access callbacks receive neither.
 *
 * Current roles are always read from `originalDoc`, never from the request body.
 * Trusting a client-supplied "previous" value would let an attacker fake a
 * no-op diff and slip an escalation through.
 */
const enforceRoleAssignment: CollectionBeforeChangeHook = async ({
  data,
  req,
  originalDoc,
  operation,
}) => {
  const actor = toAuthUser(req.user)
  const requestedRoles = toRoles(data.roles)

  if (operation === 'create' && !actor) {
    // Payload lets the very first user be created without authentication. That
    // is only reachable while the table is empty, so it is safe — but the new
    // account is forced to super-admin rather than accepting whatever the
    // request asked for.
    const existing = await req.payload.count({ collection: 'users', req })
    if (existing.totalDocs === 0) {
      return { ...data, roles: ['super-admin'] satisfies Role[] }
    }
    throw new Forbidden(req.t)
  }

  // Payload types `originalDoc` loosely; narrow it through the same guard the
  // access layer uses so a malformed document cannot be treated as a real user.
  const original = toAuthUser(originalDoc)

  const target: AuthUser =
    operation === 'create'
      ? { id: '__new__', roles: [] }
      : (original ?? { id: '__unknown__', roles: [] })

  const currentRoles = operation === 'create' ? [] : rolesOf(original)

  // An update that does not touch `roles` leaves them exactly as they were.
  const nextRoles = data.roles === undefined ? currentRoles : requestedRoles

  const result = validateRoleAssignment({ actor, target, nextRoles, currentRoles })
  if (!result.ok) throw new APIError(result.reason, 403)

  // Losing the last super-admin would leave the platform unadministrable.
  if (operation === 'update' && currentRoles.includes('super-admin')) {
    const stillSuperAdmin = nextRoles.includes('super-admin')
    if (!stillSuperAdmin) {
      const others = await countSuperAdmins(req.payload, req, original?.id)
      if (others === 0) {
        throw new APIError('Cannot remove the last super administrator', 400)
      }
    }
  }

  return { ...data, roles: nextRoles }
}

/**
 * Rank and lockout rules for deletion. Coarse access already required
 * `users:manage`; this is where the target document becomes available.
 */
const enforceUserDeletion: CollectionBeforeDeleteHook = async ({ req, id }) => {
  const actor = toAuthUser(req.user)
  if (!actor) throw new Forbidden(req.t)

  if (isSameUser(actor, id)) {
    throw new APIError('You cannot delete your own account', 400)
  }

  const target = await req.payload.findByID({ collection: 'users', id, req, depth: 0 })
  const targetRoles = rolesOf(toAuthUser(target))

  // Reuse the assignment rules: removing an account revokes every role it holds,
  // so the actor must be permitted to revoke each of them.
  const result = validateRoleAssignment({
    actor,
    target: { id, roles: targetRoles },
    nextRoles: ['contributor'],
    currentRoles: targetRoles,
  })
  if (!result.ok) throw new APIError(result.reason, 403)

  if (targetRoles.includes('super-admin')) {
    const others = await countSuperAdmins(req.payload, req, id)
    if (others === 0) throw new APIError('Cannot delete the last super administrator', 400)
  }
}

export const Users: CollectionConfig = {
  slug: 'users',

  auth: {
    tokenExpiration: 60 * 60 * 2, // 2 hours
    maxLoginAttempts: 5,
    lockTime: 10 * 60 * 1000, // 10 minutes
    cookies: {
      // Lax (not None) so the session cookie is not sent on cross-site requests,
      // which is the first line of CSRF defence alongside Payload's csrf list.
      sameSite: 'Lax',
      // Follows the scheme the site is served over, not APP_ENV. A Secure
      // cookie sent over http:// is discarded by the browser, and the failure
      // is silent: login returns 200 and the admin bounces back to the form.
      secure: shouldUseSecureCookies(env().NEXT_PUBLIC_SITE_URL),
    },
  },

  access: {
    /**
     * `users:manage`, or the first-user bootstrap.
     *
     * Access runs before hooks, so the bootstrap allowance has to live here too.
     * It is gated on the table being empty, which is reachable exactly once in
     * the lifetime of an installation; `enforceRoleAssignment` then forces the
     * resulting account to super-admin rather than trusting the request body.
     */
    create: async ({ req }) => {
      if (can(toAuthUser(req.user), 'users:manage')) return true
      const { totalDocs } = await req.payload.count({ collection: 'users', req })
      return totalDocs === 0
    },
    read: selfOrUserManager,
    update: selfOrUserManager,
    delete: hasCapability('users:manage'),
    // Payload's `unlock` bypasses the login lockout, so it is an administrative
    // action rather than something an editor should reach.
    unlock: hasCapability('users:manage'),
    admin: ({ req }) => toAuthUser(req.user) !== null,
  },

  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'email', 'roles', 'updatedAt'],
    // Users who cannot manage anyone still reach their own record through the
    // account view; showing them an unusable list view is just noise.
    hidden: ({ user }) => !can(toAuthUser(user), 'users:manage'),
    group: 'Administration',
  },

  hooks: {
    beforeChange: [enforceRoleAssignment],
    beforeDelete: [enforceUserDeletion],
  },

  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      admin: { description: 'Internal display name, shown in the CMS.' },
    },
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      required: true,
      defaultValue: ['contributor'] satisfies Role[],
      index: true,
      options: ROLES.map((role) => ({ label: ROLE_LABELS[role], value: role })),
      /**
       * Deliberately no field-level `access`.
       *
       * Payload enforces field access by *stripping* the field from the incoming
       * data before hooks run. A reporter POSTing `roles: ['admin']` would then
       * get a 200 with roles silently unchanged — the escalation is blocked, but
       * it looks like it succeeded and leaves no signal that anyone tried.
       *
       * Enforcement therefore lives entirely in `enforceRoleAssignment`, which
       * sees the requested value and rejects with an explicit 403. One
       * enforcement point, and attempts are visible.
       */
      admin: {
        // Hides the control from users who cannot change roles. This is
        // presentation only; the hook is what actually authorises.
        condition: (_data, _siblingData, { user }) => can(toAuthUser(user), 'users:manage'),
        description:
          'Roles grant capabilities. You cannot assign a role at or above your own level, and you cannot change your own roles.',
      },
    },
  ],

  timestamps: true,
}
