import { beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

import {
  createUserAs,
  expectRejection,
  getTestPayload,
  seedBootstrapSuperAdmin,
  type SeededUser,
} from '../helpers/payload'

/**
 * Permission tests run against a real database through Payload's Local API with
 * `overrideAccess: false`, which is the same path REST and GraphQL take. Testing
 * the capability helpers alone would not catch a collection wired to the wrong
 * rule, and it would not prove that a `Where` constraint actually filters rows.
 */

let payload: Payload
let superAdmin: SeededUser
let admin: SeededUser
let publisher: SeededUser
let editor: SeededUser
let reporter: SeededUser
let contributor: SeededUser

beforeAll(async () => {
  payload = await getTestPayload()

  // Only reachable while the users table is empty; the hook forces super-admin.
  superAdmin = await seedBootstrapSuperAdmin(payload)

  admin = await createUserAs(payload, superAdmin.doc, {
    email: 'admin@dhakalive.test',
    name: 'Amina Admin',
    roles: ['admin'],
  })
  publisher = await createUserAs(payload, admin.doc, {
    email: 'publisher@dhakalive.test',
    name: 'Pavel Publisher',
    roles: ['publisher'],
  })
  editor = await createUserAs(payload, admin.doc, {
    email: 'editor@dhakalive.test',
    name: 'Eshita Editor',
    roles: ['editor'],
  })
  reporter = await createUserAs(payload, admin.doc, {
    email: 'reporter@dhakalive.test',
    name: 'Rafiq Reporter',
    roles: ['reporter'],
  })
  contributor = await createUserAs(payload, admin.doc, {
    email: 'contributor@dhakalive.test',
    name: 'Chaya Contributor',
    roles: ['contributor'],
  })
})

describe('bootstrap', () => {
  it('forces the first user to super-admin regardless of what was requested', () => {
    // The helper asks for `contributor`; the hook must override it.
    expect(superAdmin.doc.roles).toEqual(['super-admin'])
  })

  it('closes the unauthenticated create path once a user exists', async () => {
    const message = await expectRejection(
      payload.create({
        collection: 'users',
        data: {
          email: 'intruder@dhakalive.test',
          password: 'dev-only-password-Aa1!',
          name: 'Intruder',
          roles: ['super-admin'],
        },
        overrideAccess: false,
      }),
    )
    expect(message).toBeTruthy()

    const found = await payload.find({
      collection: 'users',
      where: { email: { equals: 'intruder@dhakalive.test' } },
      overrideAccess: true,
    })
    expect(found.totalDocs).toBe(0)
  })
})

describe('creating users', () => {
  it('lets an admin create a publisher', () => {
    expect(publisher.doc.roles).toEqual(['publisher'])
  })

  it.each([
    ['reporter', () => reporter],
    ['editor', () => editor],
    ['publisher', () => publisher],
  ])('refuses %s creating a user', async (_label, getActor) => {
    const message = await expectRejection(
      payload.create({
        collection: 'users',
        data: {
          email: `escalate-${_label}@dhakalive.test`,
          password: 'dev-only-password-Aa1!',
          name: 'Should not exist',
          roles: ['contributor'],
        },
        user: getActor().doc,
        overrideAccess: false,
      }),
    )
    expect(message).toBeTruthy()
  })

  it('refuses an admin creating another admin', async () => {
    const message = await expectRejection(
      createUserAs(payload, admin.doc, {
        email: 'second-admin@dhakalive.test',
        name: 'Second Admin',
        roles: ['admin'],
      }),
    )
    expect(message).toContain('admin')
  })

  it('refuses an admin creating a super-admin', async () => {
    const message = await expectRejection(
      createUserAs(payload, admin.doc, {
        email: 'fake-root@dhakalive.test',
        name: 'Fake Root',
        roles: ['super-admin'],
      }),
    )
    expect(message).toContain('super-admin')
  })

  it('lets a super-admin create an admin', async () => {
    const created = await createUserAs(payload, superAdmin.doc, {
      email: 'second-admin-ok@dhakalive.test',
      name: 'Second Admin',
      roles: ['admin'],
    })
    expect(created.doc.roles).toEqual(['admin'])
  })
})

describe('reading users', () => {
  it('refuses anonymous listing', async () => {
    const message = await expectRejection(
      payload.find({ collection: 'users', overrideAccess: false }),
    )
    expect(message).toBeTruthy()
  })

  it('limits a reporter to their own record', async () => {
    const result = await payload.find({
      collection: 'users',
      user: reporter.doc,
      overrideAccess: false,
    })
    expect(result.totalDocs).toBe(1)
    expect(result.docs[0]?.id).toBe(reporter.doc.id)
  })

  it('refuses a reporter reading another user by id', async () => {
    const message = await expectRejection(
      payload.findByID({
        collection: 'users',
        id: editor.doc.id,
        user: reporter.doc,
        overrideAccess: false,
      }),
    )
    expect(message).toBeTruthy()
  })

  it('lets an admin read any user', async () => {
    const found = await payload.findByID({
      collection: 'users',
      id: reporter.doc.id,
      user: admin.doc,
      overrideAccess: false,
    })
    expect(found.id).toBe(reporter.doc.id)
  })

  it('never returns password or salt fields', async () => {
    const found = await payload.findByID({
      collection: 'users',
      id: reporter.doc.id,
      user: admin.doc,
      overrideAccess: false,
    })
    expect(found).not.toHaveProperty('password')
    expect(found).not.toHaveProperty('salt')
    expect(found).not.toHaveProperty('hash')
  })
})

describe('updating users', () => {
  it('lets a user edit their own profile', async () => {
    const updated = await payload.update({
      collection: 'users',
      id: contributor.doc.id,
      data: { name: 'Chaya C.' },
      user: contributor.doc,
      overrideAccess: false,
    })
    expect(updated.name).toBe('Chaya C.')
  })

  it('refuses a reporter editing another user', async () => {
    const message = await expectRejection(
      payload.update({
        collection: 'users',
        id: editor.doc.id,
        data: { name: 'Hacked' },
        user: reporter.doc,
        overrideAccess: false,
      }),
    )
    expect(message).toBeTruthy()
  })

  it('refuses a reporter escalating their own roles', async () => {
    await expectRejection(
      payload.update({
        collection: 'users',
        id: reporter.doc.id,
        data: { roles: ['admin'] },
        user: reporter.doc,
        overrideAccess: false,
      }),
    )

    const after = await payload.findByID({
      collection: 'users',
      id: reporter.doc.id,
      overrideAccess: true,
    })
    expect(after.roles).toEqual(['reporter'])
  })

  it('refuses an admin escalating their own roles', async () => {
    const message = await expectRejection(
      payload.update({
        collection: 'users',
        id: admin.doc.id,
        data: { roles: ['super-admin'] },
        user: admin.doc,
        overrideAccess: false,
      }),
    )
    expect(message).toContain('your own roles')

    const after = await payload.findByID({
      collection: 'users',
      id: admin.doc.id,
      overrideAccess: true,
    })
    expect(after.roles).toEqual(['admin'])
  })

  it('lets an admin promote a contributor to editor', async () => {
    const target = await createUserAs(payload, admin.doc, {
      email: 'promote-me@dhakalive.test',
      name: 'Promote Me',
      roles: ['contributor'],
    })

    const updated = await payload.update({
      collection: 'users',
      id: target.doc.id,
      data: { roles: ['editor'] },
      user: admin.doc,
      overrideAccess: false,
    })
    expect(updated.roles).toEqual(['editor'])
  })

  it('refuses an admin modifying a peer admin', async () => {
    const peer = await createUserAs(payload, superAdmin.doc, {
      email: 'peer-admin@dhakalive.test',
      name: 'Peer Admin',
      roles: ['admin'],
    })

    const message = await expectRejection(
      payload.update({
        collection: 'users',
        id: peer.doc.id,
        data: { roles: ['reporter'] },
        user: admin.doc,
        overrideAccess: false,
      }),
    )
    expect(message).toContain('above your own')
  })

  it('lets an admin edit a subordinate without touching roles', async () => {
    const updated = await payload.update({
      collection: 'users',
      id: publisher.doc.id,
      data: { name: 'Pavel P.' },
      user: admin.doc,
      overrideAccess: false,
    })
    expect(updated.name).toBe('Pavel P.')
    expect(updated.roles).toEqual(['publisher'])
  })

  it('refuses removing the last super-admin', async () => {
    const message = await expectRejection(
      payload.update({
        collection: 'users',
        id: superAdmin.doc.id,
        data: { roles: ['admin'] },
        user: superAdmin.doc,
        overrideAccess: false,
      }),
    )
    // Blocked as self-role-change before the lockout guard is even reached.
    expect(message).toContain('your own roles')
  })
})

describe('deleting users', () => {
  it('refuses deleting your own account', async () => {
    const message = await expectRejection(
      payload.delete({
        collection: 'users',
        id: admin.doc.id,
        user: admin.doc,
        overrideAccess: false,
      }),
    )
    expect(message).toContain('your own account')
  })

  it('refuses a reporter deleting anyone', async () => {
    const message = await expectRejection(
      payload.delete({
        collection: 'users',
        id: contributor.doc.id,
        user: reporter.doc,
        overrideAccess: false,
      }),
    )
    expect(message).toBeTruthy()
  })

  it('refuses an admin deleting a peer admin', async () => {
    const peer = await createUserAs(payload, superAdmin.doc, {
      email: 'delete-peer@dhakalive.test',
      name: 'Delete Peer',
      roles: ['admin'],
    })

    const message = await expectRejection(
      payload.delete({
        collection: 'users',
        id: peer.doc.id,
        user: admin.doc,
        overrideAccess: false,
      }),
    )
    expect(message).toContain('above your own')
  })

  it('lets an admin delete a subordinate', async () => {
    const target = await createUserAs(payload, admin.doc, {
      email: 'delete-me@dhakalive.test',
      name: 'Delete Me',
      roles: ['reporter'],
    })

    await payload.delete({
      collection: 'users',
      id: target.doc.id,
      user: admin.doc,
      overrideAccess: false,
    })

    const found = await payload.find({
      collection: 'users',
      where: { email: { equals: 'delete-me@dhakalive.test' } },
      overrideAccess: true,
    })
    expect(found.totalDocs).toBe(0)
  })

  it('refuses deleting the last super-admin', async () => {
    const message = await expectRejection(
      payload.delete({
        collection: 'users',
        id: superAdmin.doc.id,
        user: superAdmin.doc,
        overrideAccess: false,
      }),
    )
    // Self-deletion is refused first; either guard keeps the account alive.
    expect(message).toBeTruthy()

    const stillThere = await payload.findByID({
      collection: 'users',
      id: superAdmin.doc.id,
      overrideAccess: true,
    })
    expect(stillThere.roles).toEqual(['super-admin'])
  })
})
