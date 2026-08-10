import { can } from '@dhakalive/core'
import type { CollectionConfig, Where } from 'payload'

import { hasCapability, toAuthUser } from '../access'
import { seoField } from '../fields/seo'
import { slugField } from '../fields/slug'
import { revalidateEntity } from '../hooks/revalidate'

export const LIVE_BLOG_STATUSES = ['draft', 'live', 'paused', 'ended', 'archived'] as const

/**
 * A live blog is the container; its entries live in `live-blog-updates`.
 *
 * Storing updates as an array field on this document would rewrite the entire
 * document — every past entry, every relationship — on each new post. During
 * live coverage that is the exact moment writes are most frequent, so the
 * entries get their own collection and this document stays small.
 */
export const LiveBlogs: CollectionConfig = {
  slug: 'live-blogs',

  access: {
    read: ({ req }) => {
      const publiclyVisible: Where = { status: { in: ['live', 'paused', 'ended'] } }

      const user = toAuthUser(req.user)
      if (!user) return publiclyVisible
      if (can(user, 'liveblog:manage.any')) return true

      return { or: [publiclyVisible, { createdBy: { equals: user.id } }] } satisfies Where
    },
    create: ({ req }) => {
      const user = toAuthUser(req.user)
      return can(user, 'liveblog:manage.any') || can(user, 'liveblog:manage.own')
    },
    update: ({ req }) => {
      const user = toAuthUser(req.user)
      if (!user) return false
      if (can(user, 'liveblog:manage.any')) return true
      if (!can(user, 'liveblog:manage.own')) return false
      return { createdBy: { equals: user.id } } satisfies Where
    },
    delete: hasCapability('liveblog:manage.any'),
  },

  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'status', 'startedAt', 'endedAt'],
    group: 'Content',
  },

  hooks: {
    beforeChange: [
      ({ data, req, operation }) => {
        const user = toAuthUser(req.user)
        if (operation === 'create' && user) data.createdBy = user.id

        // Stamp the timeline boundaries from the status rather than asking an
        // editor to remember them mid-event.
        if (data.status === 'live' && !data.startedAt) data.startedAt = new Date().toISOString()
        if (data.status === 'ended' && !data.endedAt) data.endedAt = new Date().toISOString()
        return data
      },
    ],
    afterChange: [revalidateEntity('live-blog')],
  },

  fields: [
    { name: 'title', type: 'text', required: true, localized: true },
    slugField({ sourceField: 'title', localized: true }),
    { name: 'summary', type: 'textarea', localized: true },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      index: true,
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Live', value: 'live' },
        { label: 'Paused', value: 'paused' },
        { label: 'Ended', value: 'ended' },
        { label: 'Archived', value: 'archived' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'authors',
      type: 'relationship',
      relationTo: 'authors',
      hasMany: true,
    },
    {
      name: 'relatedArticle',
      type: 'relationship',
      relationTo: 'articles',
      index: true,
      admin: { position: 'sidebar', description: 'The main story this coverage accompanies.' },
    },
    {
      name: 'startedAt',
      type: 'date',
      index: true,
      admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'endedAt',
      type: 'date',
      admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'createdBy',
      type: 'relationship',
      relationTo: 'users',
      index: true,
      admin: { readOnly: true, position: 'sidebar' },
      access: { update: () => false },
    },
    seoField(),
  ],

  timestamps: true,
}
