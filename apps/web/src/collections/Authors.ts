import { can } from '@dhakalive/core'
import type { CollectionBeforeChangeHook, CollectionConfig, Where } from 'payload'
import { APIError } from 'payload'

import { hasCapability, toAuthUser } from '../access'
import { seoField } from '../fields/seo'
import { slugField } from '../fields/slug'

/**
 * Public author profiles, kept separate from `users`.
 *
 * Two reasons. Guest contributors and wire bylines need a public profile without
 * a login account; and a byline is public data while a user record holds email,
 * roles and session state that must never reach a public API response.
 *
 * The optional `user` link connects a profile to an account so a reporter's own
 * articles can be attributed automatically.
 */

/**
 * Only someone who can manage users may bind a profile to an account.
 *
 * Without this, an editor could point their own profile at an administrator's
 * account and inherit whatever that link is later used to authorise.
 */
/** Relationships arrive either as a bare id or as a populated document. */
function relationshipId(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (typeof value === 'object') {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'string' || typeof id === 'number') return String(id)
  }
  return null
}

const guardUserLink: CollectionBeforeChangeHook = ({ data, req, originalDoc, operation }) => {
  const incoming: unknown = data.user
  const existing = (originalDoc as { user?: unknown } | undefined)?.user

  const idOf = relationshipId

  const nextId = idOf(incoming)
  const previousId = operation === 'create' ? null : idOf(existing)
  if (nextId === previousId) return data

  if (!can(toAuthUser(req.user), 'users:manage')) {
    throw new APIError('Only an administrator can link an author profile to a user account', 403)
  }

  return data
}

export const Authors: CollectionConfig = {
  slug: 'authors',

  access: {
    read: () => true,
    create: hasCapability('author:manage'),
    update: ({ req }) => {
      const user = toAuthUser(req.user)
      if (!user) return false
      if (can(user, 'author:manage')) return true
      // A reporter may maintain their own byline — bio, avatar, social links.
      return { user: { equals: user.id } } satisfies Where
    },
    delete: hasCapability('author:manage'),
  },

  admin: {
    useAsTitle: 'displayName',
    defaultColumns: ['displayName', 'designation', 'isActive', 'updatedAt'],
    group: 'Content',
  },

  hooks: {
    beforeChange: [guardUserLink],
  },

  fields: [
    {
      name: 'displayName',
      type: 'text',
      required: true,
      localized: true,
      admin: { description: 'The byline as it appears on the story.' },
    },
    slugField({ sourceField: 'displayName', localized: false }),
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      unique: true,
      index: true,
      admin: {
        position: 'sidebar',
        description:
          'Links this public profile to a CMS account. Only administrators can set this.',
      },
    },
    {
      name: 'avatar',
      type: 'upload',
      relationTo: 'media',
      admin: { position: 'sidebar' },
    },
    {
      name: 'designation',
      type: 'text',
      localized: true,
      admin: { description: 'e.g. Senior Correspondent, Dhaka' },
    },
    {
      name: 'biography',
      type: 'textarea',
      localized: true,
    },
    {
      name: 'contact',
      type: 'group',
      label: 'Contact and social',
      fields: [
        { name: 'email', type: 'email' },
        { name: 'website', type: 'text' },
        { name: 'x', type: 'text', label: 'X (Twitter) handle' },
        { name: 'facebook', type: 'text' },
        { name: 'linkedin', type: 'text' },
      ],
      admin: {
        description: 'Shown on the public profile. Leave blank to hide a link.',
      },
    },
    {
      name: 'isActive',
      type: 'checkbox',
      defaultValue: true,
      index: true,
      admin: {
        position: 'sidebar',
        description:
          'Inactive authors keep their existing bylines but are hidden from author listings.',
      },
    },
    seoField(),
  ],

  timestamps: true,
}
