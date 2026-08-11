import type { GlobalConfig } from 'payload'

import { ARTICLE_TYPES } from '@dhakalive/core'

import { hasCapability } from '../access'
import { revalidateGlobal } from '../hooks/revalidate'

/**
 * Homepage composition.
 *
 * Deliberately a fixed vocabulary of named layouts rather than a free-form
 * block builder. Editors choose *which* treatment a block gets and *what* fills
 * it; they cannot invent arbitrary layouts, which is what keeps the front page
 * visually consistent and keeps its rendering statically analysable for caching.
 *
 * The shape follows how a Bengali mass-market daily actually composes a front
 * page: one fixed lead assembly at the top — lead, side column, rail, and a row
 * of sub-leads beneath — and then an ordered run of section blocks, each of
 * which may draw its stories a different way. A section is not "a category with
 * four cards"; it is a category, a manual pick, a run of recent stories or a set
 * of sub-collections, drawn in one of a dozen named treatments.
 */

const LAYOUT_OPTIONS = [
  {
    label: 'Section lead + list — one large story, the rest as headline rows',
    value: 'section-lead',
  },
  { label: 'Story cards — even grid of picture cards', value: 'story-cards' },
  { label: 'Headline rows — thumbnail beside each headline', value: 'headline-rows' },
  { label: 'Headline list — text only, no pictures', value: 'headline-list' },
  { label: 'Numbered list — ranked, text only (most read)', value: 'numbered-list' },
  { label: 'Mosaic — one hero, two cards, then a headline list', value: 'mosaic' },
  { label: 'Opinion — author portraits beside each headline', value: 'opinion' },
  { label: 'Tiny cards — a row of small picture cards', value: 'tiny-cards' },
  { label: 'Photo strip — large pictures that scroll sideways', value: 'photo-strip' },
  { label: 'Video row — one large video, four beside it', value: 'video-row' },
  { label: 'Sub-collections — a column per category', value: 'collection-columns' },
] as const

/**
 * Which layouts read a set of sub-collections rather than one story list.
 *
 * Kept as a list here and mirrored by the renderer so that the admin only shows
 * the columns editor for the layouts that can actually draw columns.
 */
const COLUMN_LAYOUTS = ['collection-columns']

function isColumnLayout(siblingData: Record<string, unknown>): boolean {
  return COLUMN_LAYOUTS.includes(String(siblingData?.layout))
}

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
      type: 'tabs',
      tabs: [
        {
          label: 'Lead',
          description: 'The assembly above the fold.',
          fields: [
            {
              name: 'leadStory',
              type: 'relationship',
              relationTo: 'articles',
              admin: {
                description:
                  'The main story. Leave empty to use the most recent published article.',
              },
            },
            {
              name: 'sideStories',
              type: 'relationship',
              relationTo: 'articles',
              hasMany: true,
              maxRows: 6,
              admin: {
                description:
                  'The column to the left of the lead. Four to six stories — the two side columns are meant to run to about the depth of the lead, and short ones leave the row ending in white.',
              },
            },
            {
              name: 'secondaryLeads',
              type: 'relationship',
              relationTo: 'articles',
              hasMany: true,
              maxRows: 6,
              label: 'Rail stories',
              admin: {
                description: 'The column to the right of the lead. Four to six stories.',
              },
            },
            {
              name: 'subLeads',
              type: 'relationship',
              relationTo: 'articles',
              hasMany: true,
              maxRows: 6,
              admin: {
                description:
                  'The row of cards directly beneath the lead assembly. Up to six stories.',
              },
            },
            {
              name: 'trendingTags',
              type: 'group',
              label: 'Trending topics strip',
              fields: [
                {
                  name: 'heading',
                  type: 'text',
                  localized: true,
                  defaultValue: 'আলোচিত বিষয়',
                },
                { name: 'enabled', type: 'checkbox', defaultValue: true },
                {
                  name: 'tags',
                  type: 'relationship',
                  relationTo: 'tags',
                  hasMany: true,
                  maxRows: 15,
                  admin: { description: 'Shown as a single scrolling row beneath the lead.' },
                },
              ],
            },
          ],
        },

        {
          label: 'Sections',
          description: 'Blocks down the page, in the order they should appear.',
          fields: [
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
              name: 'sections',
              type: 'array',
              maxRows: 20,
              labels: { singular: 'Section', plural: 'Sections' },
              admin: {
                description: 'Section blocks, in the order they should appear.',
                initCollapsed: true,
              },
              fields: [
                {
                  name: 'layout',
                  type: 'select',
                  required: true,
                  defaultValue: 'story-cards',
                  options: [...LAYOUT_OPTIONS],
                  admin: { description: 'How this block draws its stories.' },
                },
                {
                  name: 'source',
                  type: 'select',
                  required: true,
                  defaultValue: 'category',
                  options: [
                    { label: 'A category', value: 'category' },
                    { label: 'Stories chosen by hand', value: 'manual' },
                    { label: 'The most recent stories', value: 'latest' },
                    { label: 'Stories of a given type', value: 'type' },
                    { label: 'Sub-collections (one per column)', value: 'collections' },
                  ],
                  admin: {
                    description: 'Where the stories come from.',
                    condition: (_data, siblingData) => !isColumnLayout(siblingData),
                  },
                },
                {
                  name: 'category',
                  type: 'relationship',
                  relationTo: 'categories',
                  admin: {
                    description: 'Also the destination of the section heading link.',
                    condition: (_data, siblingData) =>
                      !isColumnLayout(siblingData) && siblingData?.source === 'category',
                  },
                },
                {
                  name: 'articles',
                  type: 'relationship',
                  relationTo: 'articles',
                  hasMany: true,
                  maxRows: 12,
                  admin: {
                    condition: (_data, siblingData) =>
                      !isColumnLayout(siblingData) && siblingData?.source === 'manual',
                  },
                },
                {
                  name: 'articleTypes',
                  type: 'select',
                  hasMany: true,
                  options: ARTICLE_TYPES.map((type) => ({ label: type, value: type })),
                  admin: {
                    description: 'Photo and video sections are built this way.',
                    condition: (_data, siblingData) =>
                      !isColumnLayout(siblingData) && siblingData?.source === 'type',
                  },
                },
                {
                  name: 'columns',
                  type: 'array',
                  maxRows: 4,
                  admin: {
                    description: 'One column per category. Up to four.',
                    condition: (_data, siblingData) => isColumnLayout(siblingData),
                  },
                  fields: [
                    {
                      name: 'category',
                      type: 'relationship',
                      relationTo: 'categories',
                      required: true,
                    },
                    { name: 'heading', type: 'text', localized: true },
                    { name: 'limit', type: 'number', defaultValue: 3, min: 1, max: 8 },
                  ],
                },
                {
                  name: 'heading',
                  type: 'text',
                  localized: true,
                  admin: {
                    description: "Overrides the category's own name. Leave empty to use it.",
                  },
                },
                {
                  name: 'showHeading',
                  type: 'checkbox',
                  defaultValue: true,
                  admin: { description: 'Some blocks — a card row between sections — want none.' },
                },
                {
                  name: 'limit',
                  type: 'number',
                  defaultValue: 6,
                  min: 1,
                  max: 20,
                  admin: {
                    description: 'How many stories the block draws.',
                    condition: (_data, siblingData) => !isColumnLayout(siblingData),
                  },
                },
                {
                  name: 'showAd',
                  type: 'checkbox',
                  defaultValue: false,
                  admin: {
                    description:
                      'Places a section-rail advertisement beside this block on wide screens.',
                  },
                },
              ],
            },
          ],
        },

        {
          label: 'Fixed blocks',
          description: 'Slots that always sit in the same place on the page.',
          fields: [
            {
              name: 'editorsPicks',
              type: 'group',
              fields: [
                {
                  name: 'heading',
                  type: 'text',
                  localized: true,
                  defaultValue: 'সম্পাদকের পছন্দ',
                },
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
        },
      ],
    },
  ],
}
