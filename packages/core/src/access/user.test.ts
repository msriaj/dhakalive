import { describe, expect, it } from 'vitest'
import {
  can,
  canAll,
  canAny,
  canAssignRole,
  canManageUser,
  effectiveRank,
  isSameUser,
  isSuperAdmin,
  validateRoleAssignment,
  type AuthUser,
} from './user.js'
import type { Role } from './roles.js'

function user(id: string | number, ...roles: Role[]): AuthUser {
  return { id, roles }
}

const contributor = user(1, 'contributor')
const reporter = user(2, 'reporter')
const editor = user(3, 'editor')
const publisher = user(4, 'publisher')
const admin = user(5, 'admin')
const superAdmin = user(6, 'super-admin')
const otherAdmin = user(7, 'admin')
const otherSuperAdmin = user(8, 'super-admin')

describe('can', () => {
  it('denies everything to an anonymous user', () => {
    expect(can(null, 'article:create')).toBe(false)
    expect(can(undefined, 'article:read.own')).toBe(false)
  })

  it('denies everything to a user with no roles', () => {
    expect(can({ id: 99, roles: [] }, 'article:create')).toBe(false)
    expect(can({ id: 99 }, 'article:create')).toBe(false)
    expect(can({ id: 99, roles: null }, 'article:create')).toBe(false)
  })

  it('ignores unknown role values instead of throwing', () => {
    const tampered = { id: 99, roles: ['root', 'superuser'] } as unknown as AuthUser
    expect(can(tampered, 'users:manage')).toBe(false)
    expect(effectiveRank(tampered)).toBe(0)
  })

  it('grants capabilities from the held role', () => {
    expect(can(reporter, 'article:create')).toBe(true)
    expect(can(reporter, 'article:publish')).toBe(false)
    expect(can(publisher, 'article:publish')).toBe(true)
  })
})

describe('canAny / canAll', () => {
  it('canAny is true when at least one capability is held', () => {
    expect(canAny(reporter, 'article:publish', 'article:create')).toBe(true)
    expect(canAny(reporter, 'article:publish', 'users:manage')).toBe(false)
  })

  it('canAll requires every capability', () => {
    expect(canAll(publisher, 'article:publish', 'article:schedule')).toBe(true)
    expect(canAll(publisher, 'article:publish', 'users:manage')).toBe(false)
  })
})

describe('effectiveRank', () => {
  it('is zero for anonymous', () => {
    expect(effectiveRank(null)).toBe(0)
  })

  it('takes the highest rank when a user holds several roles', () => {
    expect(effectiveRank(user(10, 'contributor', 'publisher'))).toBe(effectiveRank(publisher))
  })
})

describe('isSameUser', () => {
  it('matches across the string/number id boundary', () => {
    expect(isSameUser({ id: 5 }, { id: '5' })).toBe(true)
    expect(isSameUser(5, '5')).toBe(true)
    expect(isSameUser({ id: 5 }, 5)).toBe(true)
  })

  it('does not treat missing ids as equal', () => {
    expect(isSameUser(null, null)).toBe(false)
    expect(isSameUser(undefined, { id: 1 })).toBe(false)
  })

  it('distinguishes different users', () => {
    expect(isSameUser({ id: 5 }, { id: 6 })).toBe(false)
  })
})

describe('canManageUser', () => {
  it('requires the users:manage capability', () => {
    expect(canManageUser(publisher, contributor)).toBe(false)
    expect(canManageUser(editor, contributor)).toBe(false)
  })

  it('allows managing strictly lower ranks', () => {
    expect(canManageUser(admin, contributor)).toBe(true)
    expect(canManageUser(admin, publisher)).toBe(true)
  })

  it('refuses peers and superiors', () => {
    expect(canManageUser(admin, otherAdmin)).toBe(false)
    expect(canManageUser(admin, superAdmin)).toBe(false)
  })

  it('lets a super-admin manage another super-admin so a compromised account can be revoked', () => {
    expect(canManageUser(superAdmin, otherSuperAdmin)).toBe(true)
  })

  it('denies anonymous actors', () => {
    expect(canManageUser(null, contributor)).toBe(false)
    expect(canManageUser(admin, null)).toBe(false)
  })
})

describe('canAssignRole', () => {
  it('refuses roles at or above the actor rank', () => {
    expect(canAssignRole(admin, 'publisher')).toBe(true)
    expect(canAssignRole(admin, 'admin')).toBe(false)
    expect(canAssignRole(admin, 'super-admin')).toBe(false)
  })

  it('lets only a super-admin confer super-admin', () => {
    expect(canAssignRole(superAdmin, 'super-admin')).toBe(true)
    expect(canAssignRole(superAdmin, 'admin')).toBe(true)
  })

  it('refuses actors without users:manage', () => {
    expect(canAssignRole(publisher, 'reporter')).toBe(false)
    expect(canAssignRole(editor, 'contributor')).toBe(false)
  })
})

describe('validateRoleAssignment', () => {
  it('permits an admin to promote a reporter to editor', () => {
    const result = validateRoleAssignment({
      actor: admin,
      target: reporter,
      nextRoles: ['editor'],
    })
    expect(result).toEqual({ ok: true })
  })

  it('refuses a user escalating their own roles', () => {
    const result = validateRoleAssignment({
      actor: admin,
      target: admin,
      nextRoles: ['super-admin'],
    })
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining('your own roles') })
  })

  it('refuses a super-admin demoting themselves, which would be a lockout', () => {
    const result = validateRoleAssignment({
      actor: superAdmin,
      target: superAdmin,
      nextRoles: ['admin'],
    })
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining('your own roles') })
  })

  it('treats writing an unchanged role set to yourself as a no-op', () => {
    // Saving your own profile resubmits the roles field untouched; that must not
    // be mistaken for an escalation attempt.
    const result = validateRoleAssignment({
      actor: admin,
      target: admin,
      nextRoles: ['admin'],
    })
    expect(result).toEqual({ ok: true })
  })

  it('refuses granting a role at or above the actor rank', () => {
    const result = validateRoleAssignment({
      actor: admin,
      target: reporter,
      nextRoles: ['admin'],
    })
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining('"admin"') })
  })

  it('refuses self-promotion attempted through another account', () => {
    // An admin cannot mint a super-admin and then log in as it.
    const result = validateRoleAssignment({
      actor: admin,
      target: contributor,
      nextRoles: ['super-admin'],
    })
    expect(result.ok).toBe(false)
  })

  it('refuses modifying a peer', () => {
    const result = validateRoleAssignment({
      actor: admin,
      target: otherAdmin,
      nextRoles: ['editor'],
    })
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining('above your own') })
  })

  it('refuses revoking a role the actor could not grant', () => {
    const result = validateRoleAssignment({
      actor: admin,
      target: user(20, 'super-admin'),
      nextRoles: ['reporter'],
    })
    expect(result.ok).toBe(false)
  })

  it('refuses actors without users:manage', () => {
    const result = validateRoleAssignment({
      actor: publisher,
      target: reporter,
      nextRoles: ['editor'],
    })
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining('not permitted') })
  })

  it('refuses anonymous actors', () => {
    expect(
      validateRoleAssignment({ actor: null, target: reporter, nextRoles: ['editor'] }),
    ).toEqual({ ok: false, reason: 'Authentication required to change roles' })
  })

  it('requires at least one role', () => {
    const result = validateRoleAssignment({ actor: admin, target: reporter, nextRoles: [] })
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining('at least one') })
  })

  it('rejects unknown role values', () => {
    const result = validateRoleAssignment({
      actor: admin,
      target: reporter,
      nextRoles: ['root'] as unknown as Role[],
    })
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining('unknown') })
  })

  it('rejects duplicated roles', () => {
    const result = validateRoleAssignment({
      actor: admin,
      target: reporter,
      nextRoles: ['editor', 'editor'],
    })
    expect(result.ok).toBe(false)
  })

  it('allows an unchanged role set without requiring assignment rights', () => {
    // An admin editing a peer's display name must not be blocked by roles they
    // could never have granted, as long as the roles are not being changed.
    const result = validateRoleAssignment({
      actor: admin,
      target: otherAdmin,
      nextRoles: ['admin'],
      currentRoles: ['admin'],
    })
    expect(result).toEqual({ ok: true })
  })
})

describe('isSuperAdmin', () => {
  it('detects the role regardless of position', () => {
    expect(isSuperAdmin(user(30, 'reporter', 'super-admin'))).toBe(true)
    expect(isSuperAdmin(admin)).toBe(false)
    expect(isSuperAdmin(null)).toBe(false)
  })
})
