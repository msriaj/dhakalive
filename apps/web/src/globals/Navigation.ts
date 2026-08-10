import type { Field, GlobalConfig } from 'payload'

import { hasCapability } from '../access'

/**
 * A navigation entry.
 *
 * Deliberately a small closed set of link kinds rather than a free URL field:
 * category and page links stay correct when a slug changes, and a `custom` entry
 * is validated as http/https so a `javascript:` URL cannot reach the nav.
 */
const linkFields: Field[] = [
  {
    name: 'label',
    type: 'text',
    required: true,
    localized: true,
  },
  {
    name: 'type',
    type: 'select',
    required: true,
    defaultValue: 'category',
    options: [
      { label: 'Category', value: 'category' },
      { label: 'Page', value: 'page' },
      { label: 'Custom URL', value: 'custom' },
    ],
  },
  {
    name: 'category',
    type: 'relationship',
    relationTo: 'categories',
    admin: {
      condition: (_data: unknown, siblingData: Record<string, unknown>) =>
        siblingData?.type === 'category',
    },
  },
  {
    name: 'page',
    type: 'relationship',
    relationTo: 'pages',
    admin: {
      condition: (_data: unknown, siblingData: Record<string, unknown>) =>
        siblingData?.type === 'page',
    },
  },
  {
    name: 'url',
    type: 'text',
    admin: {
      condition: (_data: unknown, siblingData: Record<string, unknown>) =>
        siblingData?.type === 'custom',
    },
    validate: (value: unknown, { siblingData }: { siblingData?: Record<string, unknown> }) => {
      if (siblingData?.type !== 'custom') return true
      if (typeof value !== 'string' || value.length === 0) return 'A URL is required'
      // Relative paths are fine; absolute ones must be http(s).
      if (value.startsWith('/')) return true
      try {
        const url = new URL(value)
        if (url.protocol !== 'https:' && url.protocol !== 'http:') {
          return 'Only http and https URLs are allowed'
        }
        return true
      } catch {
        return 'Must be a path starting with / or an absolute http(s) URL'
      }
    },
  },
]

export const Header: GlobalConfig = {
  slug: 'header',

  access: {
    read: () => true,
    update: hasCapability('globals:manage.editorial'),
  },

  admin: { group: 'Navigation' },

  fields: [
    {
      name: 'primary',
      type: 'array',
      label: 'Primary navigation',
      maxRows: 10,
      admin: { description: 'Main masthead navigation. Ten entries maximum.' },
      fields: [
        ...linkFields,
        {
          name: 'children',
          type: 'array',
          label: 'Dropdown items',
          maxRows: 8,
          fields: linkFields,
        },
      ],
    },
    {
      name: 'showBreakingTicker',
      type: 'checkbox',
      defaultValue: true,
      admin: { description: 'Show the breaking-news ticker beneath the masthead.' },
    },
    {
      name: 'tickerLabel',
      type: 'text',
      localized: true,
      defaultValue: 'ব্রেকিং',
      admin: { condition: (data: Record<string, unknown>) => Boolean(data?.showBreakingTicker) },
    },
  ],
}

export const Footer: GlobalConfig = {
  slug: 'footer',

  access: {
    read: () => true,
    update: hasCapability('globals:manage.editorial'),
  },

  admin: { group: 'Navigation' },

  fields: [
    {
      name: 'columns',
      type: 'array',
      maxRows: 4,
      fields: [
        { name: 'heading', type: 'text', localized: true, required: true },
        { name: 'links', type: 'array', maxRows: 8, fields: linkFields },
      ],
    },
    {
      name: 'copyright',
      type: 'text',
      localized: true,
      admin: { description: 'Shown after the year, which is added automatically.' },
    },
  ],
}
