import { describe, expect, it } from 'vitest'
import { CAPABILITIES, capabilitiesForRole, capabilitiesForRoles } from './capabilities.js'
import { ROLES, ROLE_RANK, type Role } from './roles.js'

const ASCENDING: readonly Role[] = [...ROLES].sort((a, b) => ROLE_RANK[a] - ROLE_RANK[b])

describe('capability matrix', () => {
  it('is monotonic — every role holds everything the role below it holds', () => {
    for (let i = 1; i < ASCENDING.length; i += 1) {
      const lower = ASCENDING[i - 1]!
      const higher = ASCENDING[i]!
      const lowerCaps = capabilitiesForRole(lower)
      const higherCaps = capabilitiesForRole(higher)

      const missing = [...lowerCaps].filter((capability) => !higherCaps.has(capability))
      expect(missing, `${higher} is missing capabilities held by ${lower}`).toEqual([])
    }
  })

  it('grants super-admin every declared capability', () => {
    const superAdmin = capabilitiesForRole('super-admin')
    const missing = CAPABILITIES.filter((capability) => !superAdmin.has(capability))
    expect(missing).toEqual([])
  })

  it('gives each role strictly more than the one below it', () => {
    for (let i = 1; i < ASCENDING.length; i += 1) {
      const lower = capabilitiesForRole(ASCENDING[i - 1]!)
      const higher = capabilitiesForRole(ASCENDING[i]!)
      expect(higher.size).toBeGreaterThan(lower.size)
    }
  })

  it('has a distinct rank for every role', () => {
    const ranks = ROLES.map((role) => ROLE_RANK[role])
    expect(new Set(ranks).size).toBe(ROLES.length)
  })
})

describe('publication capabilities', () => {
  it.each(['contributor', 'reporter', 'editor'] as const)('%s cannot publish', (role) => {
    const caps = capabilitiesForRole(role)
    expect(caps.has('article:publish')).toBe(false)
    expect(caps.has('article:approve')).toBe(false)
    expect(caps.has('article:schedule')).toBe(false)
    expect(caps.has('article:unpublish')).toBe(false)
  })

  it.each(['publisher', 'admin', 'super-admin'] as const)('%s can publish', (role) => {
    const caps = capabilitiesForRole(role)
    expect(caps.has('article:publish')).toBe(true)
    expect(caps.has('article:approve')).toBe(true)
    expect(caps.has('article:schedule')).toBe(true)
    expect(caps.has('article:unpublish')).toBe(true)
  })

  it.each(['contributor', 'reporter'] as const)('%s cannot review', (role) => {
    expect(capabilitiesForRole(role).has('article:review')).toBe(false)
  })

  it('lets editors review and request changes', () => {
    expect(capabilitiesForRole('editor').has('article:review')).toBe(true)
  })
})

describe('draft visibility', () => {
  it.each(['contributor', 'reporter'] as const)('%s cannot read any article', (role) => {
    const caps = capabilitiesForRole(role)
    expect(caps.has('article:read.own')).toBe(true)
    expect(caps.has('article:read.any')).toBe(false)
  })

  it.each(['editor', 'publisher', 'admin', 'super-admin'] as const)(
    '%s can read any article',
    (role) => {
      expect(capabilitiesForRole(role).has('article:read.any')).toBe(true)
    },
  )
})

describe('administrative capabilities', () => {
  it.each(['contributor', 'reporter', 'editor', 'publisher'] as const)(
    '%s cannot manage users',
    (role) => {
      expect(capabilitiesForRole(role).has('users:manage')).toBe(false)
    },
  )

  it.each(['contributor', 'reporter', 'editor', 'publisher'] as const)(
    '%s cannot read audit logs',
    (role) => {
      expect(capabilitiesForRole(role).has('audit:read')).toBe(false)
    },
  )

  it('keeps audit logs append-only for admins', () => {
    expect(capabilitiesForRole('admin').has('audit:read')).toBe(true)
    expect(capabilitiesForRole('admin').has('audit:delete')).toBe(false)
    expect(capabilitiesForRole('super-admin').has('audit:delete')).toBe(true)
  })

  it('reserves system globals for administrators', () => {
    expect(capabilitiesForRole('editor').has('globals:manage.editorial')).toBe(true)
    expect(capabilitiesForRole('publisher').has('globals:manage.system')).toBe(false)
    expect(capabilitiesForRole('admin').has('globals:manage.system')).toBe(true)
  })

  it('keeps hard deletion of articles away from editors', () => {
    expect(capabilitiesForRole('editor').has('article:archive')).toBe(true)
    expect(capabilitiesForRole('editor').has('article:delete.any')).toBe(false)
    expect(capabilitiesForRole('publisher').has('article:delete.any')).toBe(false)
    expect(capabilitiesForRole('admin').has('article:delete.any')).toBe(true)
  })
})

describe('capabilitiesForRoles', () => {
  it('unions the capabilities of multiple roles', () => {
    const combined = capabilitiesForRoles(['reporter', 'publisher'])
    expect(combined.has('article:publish')).toBe(true)
    expect(combined.has('liveblog:manage.own')).toBe(true)
  })

  it('returns nothing for an empty role list', () => {
    expect(capabilitiesForRoles([]).size).toBe(0)
  })
})
