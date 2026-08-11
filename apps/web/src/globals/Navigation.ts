import type { Field, GlobalConfig } from 'payload'

import { hasCapability } from '../access'
import { revalidateGlobal } from '../hooks/revalidate'

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

  hooks: {
    afterChange: [revalidateGlobal('header')],
  },

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

  hooks: {
    afterChange: [revalidateGlobal('footer')],
  },

  /**
   * Four bands, in the order a Bengali daily prints them: the group's other
   * titles, the section columns, the follow-and-download band, and then the
   * statutory row — policy links, copyright and the imprint.
   *
   * The imprint is a field rather than a hardcoded string because naming the
   * editor and publisher in the footer is a legal requirement for a registered
   * newspaper, and the person named changes.
   */
  fields: [
    {
      name: 'brandLinks',
      type: 'array',
      label: 'Sister publications',
      maxRows: 12,
      admin: {
        description:
          'The group\'s other titles, printed as one row above the footer proper. Uses "Custom URL" for anything off this site.',
      },
      fields: linkFields,
    },
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
      name: 'followHeading',
      type: 'text',
      localized: true,
      defaultValue: 'অনুসরণ করুন',
      admin: { description: 'Sits above the social links, which come from Site settings.' },
    },
    {
      name: 'apps',
      type: 'group',
      label: 'Mobile apps',
      fields: [
        {
          name: 'heading',
          type: 'text',
          localized: true,
          defaultValue: 'মোবাইল অ্যাপস ডাউনলোড করুন',
        },
        { name: 'appStoreUrl', type: 'text', label: 'App Store URL' },
        { name: 'playStoreUrl', type: 'text', label: 'Google Play URL' },
      ],
    },
    {
      name: 'bottomLinks',
      type: 'array',
      label: 'Statutory links',
      maxRows: 10,
      admin: { description: 'About, advertising, terms, contact — one row above the copyright.' },
      fields: linkFields,
    },
    {
      name: 'copyright',
      type: 'text',
      localized: true,
      admin: { description: 'Shown after the year, which is added automatically.' },
    },
    {
      name: 'imprint',
      type: 'text',
      localized: true,
      admin: { description: 'Editor and publisher, as the masthead must state them.' },
    },
  ],
}
