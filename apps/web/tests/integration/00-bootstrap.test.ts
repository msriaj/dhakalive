import { beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

import {
  expectRejection,
  getTestPayload,
  seedBootstrapSuperAdmin,
  truncateUsers,
} from '../helpers/payload'

/**
 * First-user bootstrap.
 *
 * Runs before every other integration suite — the numeric filename prefix is
 * load-bearing, because this is the only suite that requires an empty users
 * table, and the super-admin it creates is reused by the rest of the run.
 */

let payload: Payload

beforeAll(async () => {
  payload = await getTestPayload()
  await truncateUsers(payload)
})

describe('first-user bootstrap', () => {
  it('forces the first user to super-admin regardless of what was requested', async () => {
    // The helper asks for `contributor`; the hook must override it.
    const seeded = await seedBootstrapSuperAdmin(payload)
    expect(seeded.doc.roles).toEqual(['super-admin'])
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
