import type { CollectionConfig } from 'payload'

import { hasCapability } from '../access'
import { seoField } from '../fields/seo'
import { slugField } from '../fields/slug'

/**
 * Free-form topical tags. Unlike categories these are flat — a story has one
 * primary section but any number of topics.
 */
export const Tags: CollectionConfig = {
  slug: 'tags',

  access: {
    read: () => true,
    create: hasCapability('taxonomy:manage'),
    update: hasCapability('taxonomy:manage'),
    delete: hasCapability('taxonomy:manage'),
  },

  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'updatedAt'],
    group: 'Content',
  },

  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
    },
    slugField({ sourceField: 'title', localized: true }),
    {
      name: 'description',
      type: 'textarea',
      localized: true,
    },
    seoField(),
  ],

  timestamps: true,
}
