import type { CollectionConfig } from 'payload'

import { env } from '../lib/env'

/**
 * Phase 1 shape only: enough of an auth collection for Payload to boot and for
 * the admin panel to have an owner. Roles, the capability matrix and every
 * access rule land in Phase 2 — deliberately not stubbed here, because a
 * permissive placeholder is the kind of thing that survives to production.
 */
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
      // Secure everywhere except local development, where there is no TLS.
      secure: env().APP_ENV !== 'development',
    },
  },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['name', 'email', 'updatedAt'],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
  ],
}
