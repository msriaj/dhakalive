import type { GlobalConfig } from 'payload'

import { hasCapability } from '../access'
import { revalidateGlobal } from '../hooks/revalidate'

/**
 * Homepage composition.
 *
 * Deliberately a fixed set of named slots rather than a free-form layout
 * builder. Editors choose *what* appears in each region; they cannot invent
 * arbitrary layouts, which is what keeps the front page visually consistent and
 * keeps its rendering statically analysable for caching.
 */
export const Homepage: GlobalConfig = {
  slug: 'homepage',

  access: {
    read: () => true,
    update: hasCapability('globals:manage.editorial'),
  },

  admin: { group: 'Navigation' },

  hooks: {
    afterChange: [revalidateGlobal('homepage')],
  },

  fields: [
    {
      name: 'leadStory',
      type: 'relationship',
      relationTo: 'articles',
      admin: {
        description: 'The main story. Leave empty to use the most recent published article.',
      },
    },
    {
      name: 'secondaryLeads',
      type: 'relationship',
      relationTo: 'articles',
      hasMany: true,
      maxRows: 4,
      admin: { description: 'Up to four stories beside the lead.' },
    },
    {
      name: 'latestNews',
      type: 'group',
      fields: [
        { name: 'heading', type: 'text', localized: true, defaultValue: 'সর্বশেষ' },
        {
          name: 'limit',
          type: 'number',
          defaultValue: 10,
          min: 3,
          max: 30,
          admin: { description: 'How many recent stories to list.' },
        },
      ],
    },
    {
      name: 'categorySections',
      type: 'array',
      maxRows: 6,
      admin: { description: 'Section blocks, in the order they should appear.' },
      fields: [
        { name: 'category', type: 'relationship', relationTo: 'categories', required: true },
        { name: 'heading', type: 'text', localized: true },
        { name: 'limit', type: 'number', defaultValue: 4, min: 2, max: 12 },
      ],
    },
    {
      name: 'editorsPicks',
      type: 'group',
      fields: [
        { name: 'heading', type: 'text', localized: true, defaultValue: 'সম্পাদকের পছন্দ' },
        {
          name: 'articles',
          type: 'relationship',
          relationTo: 'articles',
          hasMany: true,
          maxRows: 6,
        },
      ],
    },
    {
      name: 'trending',
      type: 'group',
      fields: [
        { name: 'heading', type: 'text', localized: true, defaultValue: 'ট্রেন্ডিং' },
        {
          name: 'enabled',
          type: 'checkbox',
          defaultValue: true,
          admin: {
            description:
              'Ordered by view count, which is eventually consistent — counts are aggregated periodically, not written per request.',
          },
        },
        { name: 'limit', type: 'number', defaultValue: 5, min: 3, max: 10 },
      ],
    },
    {
      name: 'mediaSection',
      type: 'group',
      label: 'Photo and video section',
      fields: [
        { name: 'heading', type: 'text', localized: true, defaultValue: 'ছবি ও ভিডিও' },
        { name: 'enabled', type: 'checkbox', defaultValue: true },
        { name: 'limit', type: 'number', defaultValue: 4, min: 2, max: 8 },
      ],
    },
  ],
}
