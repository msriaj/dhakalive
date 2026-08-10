import { getPayload, type Payload } from 'payload'
import type { Role } from '@dhakalive/core'
import config from '../../src/payload.config'

/**
 * Shared Payload instance for the integration suite. Booting Payload opens a
 * connection pool and builds the schema, so it happens once per run.
 */
let instance: Payload | null = null

export async function getTestPayload(): Promise<Payload> {
  instance ??= await getPayload({ config })
  return instance
}

/** Payload's Local API wants the full user document, including its collection. */
export type ActingUser = Record<string, unknown> & { id: string | number; collection: 'users' }

export interface SeededUser {
  doc: ActingUser
  email: string
  password: string
}

const PASSWORD = 'dev-only-password-Aa1!'

/**
 * Creates the very first user.
 *
 * Payload allows this without authentication only while the users table is
 * empty, and the collection hook forces the result to `super-admin`. Every other
 * account in the suite is then created *through* that user, so the tests
 * exercise the real authorisation path rather than bypassing it.
 */
export async function seedBootstrapSuperAdmin(payload: Payload): Promise<SeededUser> {
  const email = 'root@dhakalive.test'
  const doc = await payload.create({
    collection: 'users',
    data: { email, password: PASSWORD, name: 'Bootstrap Super Admin', roles: ['contributor'] },
    overrideAccess: false,
  })

  return { doc: { ...doc, collection: 'users' }, email, password: PASSWORD }
}

/** Creates a user as `actor`, exercising access control and the role guards. */
export async function createUserAs(
  payload: Payload,
  actor: ActingUser,
  input: { email: string; name: string; roles: Role[] },
): Promise<SeededUser> {
  const doc = await payload.create({
    collection: 'users',
    data: { ...input, password: PASSWORD },
    user: actor,
    overrideAccess: false,
  })

  return {
    doc: { ...doc, collection: 'users' },
    email: input.email,
    password: PASSWORD,
  }
}

/**
 * Extracts the message from a rejected Payload operation.
 *
 * Payload wraps access failures in several error shapes (`Forbidden`,
 * `APIError`, `ValidationError`), so tests assert on the message rather than on
 * a specific class.
 */
export async function expectRejection(operation: Promise<unknown>): Promise<string> {
  try {
    await operation
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  throw new Error('Expected the operation to be rejected, but it succeeded')
}
