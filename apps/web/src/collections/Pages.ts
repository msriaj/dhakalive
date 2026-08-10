import { can } from '@dhakalive/core'
import type { CollectionConfig, Where } from 'payload'

import { hasCapability, toAuthUser } from '../access'
import { seoField } from '../fields/seo'
import { slugField } from '../fields/slug'
import { revalidateEntity } from '../hooks/revalidate'

/**
 * Standing pages — privacy, terms, about, contact, editorial policy.
 *
 * Unlike articles these have no editorial workflow: they are rare, long-lived
 * and edited by whoever maintains them. Payload's native draft/publish is
 * enough, so there is no custom status field and therefore no `_status`
 * collision to design around.
 */
export const Pages: CollectionConfig = {
  slug: 'pages',

  access: {
    read: ({ req }) => {
      const publishedOnly: Where = { _status: { equals: 'published' } }
      const user = toAuthUser(req.user)
      if (!user) return publishedOnly
      if (can(user, 'globals:manage.editorial')) return true
      return publishedOnly
    },
    create: hasCapability('globals:manage.editorial'),
    update: hasCapability('globals:manage.editorial'),
    delete: hasCapability('globals:manage.system'),
  },

  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'updatedAt'],
    group: 'Content',
  },

  versions: {
    drafts: { autosave: { interval: 1000 } },
    maxPerDoc: 20,
  },

  hooks: {
    afterChange: [revalidateEntity('page')],
  },

  fields: [
    { name: 'title', type: 'text', required: true, localized: true },
    slugField({ sourceField: 'title', localized: true }),
    {
      name: 'body',
      type: 'richText',
      localized: true,
    },
    {
      name: 'showInFooter',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description: 'Adds this page to the legal links row in the footer.',
      },
    },
    seoField(),
  ],

  timestamps: true,
}
