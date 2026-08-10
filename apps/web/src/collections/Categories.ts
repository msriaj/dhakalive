import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'
import { APIError } from 'payload'

import { hasCapability } from '../access'
import { seoField } from '../fields/seo'
import { slugField } from '../fields/slug'
import { revalidateEntity } from '../hooks/revalidate'

/** Depth beyond which a section tree stops being navigable. */
const MAX_CATEGORY_DEPTH = 4

/**
 * Rejects a parent assignment that would create a cycle.
 *
 * Walks up from the proposed parent looking for this document. Without it, two
 * categories can be made each other's parent, and every recursive read —
 * breadcrumbs, sitemap generation, navigation — becomes an infinite loop.
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

const preventCircularParent: CollectionBeforeChangeHook = async ({ data, req, originalDoc }) => {
  const parentKey = relationshipId(data.parent)
  if (parentKey === null) return data

  const selfId = relationshipId((originalDoc as { id?: unknown } | undefined)?.id)

  if (selfId !== null && parentKey === selfId) {
    throw new APIError('A category cannot be its own parent', 400)
  }

  let cursor: string | null = parentKey
  for (let depth = 0; depth < MAX_CATEGORY_DEPTH + 1; depth += 1) {
    if (cursor === null) return data

    if (selfId !== null && cursor === selfId) {
      throw new APIError('That parent would create a loop in the category tree', 400)
    }

    const ancestor = await req.payload.findByID({
      collection: 'categories',
      id: cursor,
      depth: 0,
      req,
      // A missing ancestor is a data problem, not a reason to reject the edit.
      disableErrors: true,
    })
    if (!ancestor) return data

    cursor = relationshipId(ancestor.parent)
  }

  throw new APIError(`Categories may not nest more than ${MAX_CATEGORY_DEPTH} levels deep`, 400)
}

export const Categories: CollectionConfig = {
  slug: 'categories',

  access: {
    read: () => true,
    create: hasCapability('taxonomy:manage'),
    update: hasCapability('taxonomy:manage'),
    delete: hasCapability('taxonomy:manage'),
  },

  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'parent', 'displayOrder', 'isActive'],
    group: 'Content',
  },

  hooks: {
    beforeChange: [preventCircularParent],
    afterChange: [revalidateEntity('category')],
  },

  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
      admin: { description: 'Section name as readers see it, e.g. রাজনীতি / Politics.' },
    },
    slugField({ sourceField: 'title', localized: true }),
    {
      name: 'description',
      type: 'textarea',
      localized: true,
    },
    {
      name: 'parent',
      type: 'relationship',
      relationTo: 'categories',
      index: true,
      admin: {
        position: 'sidebar',
        description: `Leave empty for a top-level section. Maximum ${MAX_CATEGORY_DEPTH} levels.`,
      },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      admin: { position: 'sidebar' },
    },
    {
      name: 'displayOrder',
      type: 'number',
      defaultValue: 0,
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Lower numbers appear first in navigation.',
      },
    },
    {
      name: 'isActive',
      type: 'checkbox',
      defaultValue: true,
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Inactive sections stay published but disappear from navigation.',
      },
    },
    seoField(),
  ],

  timestamps: true,
}

export { MAX_CATEGORY_DEPTH }
