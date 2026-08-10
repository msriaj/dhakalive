import { can } from '@dhakalive/core'
import type { CollectionConfig, Where } from 'payload'

import { hasCapability, toAuthUser } from '../access'
import { revalidateLiveBlogUpdate } from '../hooks/revalidate'

/**
 * A single entry in a live blog.
 *
 * Separate from `live-blogs` so posting an update is one small insert rather
 * than a rewrite of the whole timeline. The `(liveBlog, publishedAt)` index is
 * what makes paging a long-running event cheap.
 */
export const LiveBlogUpdates: CollectionConfig = {
  slug: 'live-blog-updates',

  access: {
    read: () => true,
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
    useAsTitle: 'headline',
    defaultColumns: ['headline', 'liveBlog', 'publishedAt', 'isPinned'],
    group: 'Content',
    // Entries are edited from within their live blog, not browsed on their own.
    hidden: ({ user }) => !can(toAuthUser(user), 'liveblog:manage.any'),
  },

  hooks: {
    beforeChange: [
      ({ data, req, operation }) => {
        const user = toAuthUser(req.user)
        if (operation === 'create') {
          if (user) data.createdBy = user.id
          data.publishedAt ??= new Date().toISOString()
        }
        return data
      },
    ],
    afterChange: [revalidateLiveBlogUpdate],
  },

  fields: [
    {
      name: 'liveBlog',
      type: 'relationship',
      relationTo: 'live-blogs',
      required: true,
      index: true,
    },
    {
      name: 'publishedAt',
      type: 'date',
      required: true,
      index: true,
      admin: {
        description: 'Timestamp shown against the entry.',
        date: { pickerAppearance: 'dayAndTime' },
      },
    },
    { name: 'headline', type: 'text', localized: true },
    { name: 'content', type: 'richText', localized: true },
    {
      name: 'media',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'authors',
    },
    {
      name: 'isPinned',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      admin: { description: 'Pinned entries stay at the top of the timeline.' },
    },
    {
      name: 'isCorrection',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'Marks this entry as correcting an earlier one.' },
    },
    {
      name: 'createdBy',
      type: 'relationship',
      relationTo: 'users',
      index: true,
      admin: { readOnly: true },
      access: { update: () => false },
    },
  ],

  timestamps: true,
}
