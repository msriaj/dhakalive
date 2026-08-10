import { AD_PLACEMENTS, LOCALES_LABEL } from './advertisement-options'
import type { CollectionConfig } from 'payload'

import { hasCapability, toAuthUser } from '../access'
import { revalidateEntity } from '../hooks/revalidate'

/**
 * Advertisements.
 *
 * ## No third-party script tags
 *
 * The obvious shape for this collection is a rich-text or raw-HTML "creative"
 * field that an ad operations person pastes a network tag into. It is
 * deliberately not that.
 *
 * A pasted script tag is arbitrary JavaScript executing with the publication's
 * origin: it can read the session cookie of a logged-in editor, rewrite the
 * story it sits inside, and load further scripts from anywhere. Newsrooms have
 * been compromised exactly this way. Since the field would be writable by
 * whoever holds `ads:manage`, it would also mean that role quietly implies
 * "can execute code on every page".
 *
 * So a creative here is an uploaded image and a destination URL, rendered by
 * our own component with `rel="sponsored noopener"`. Integrating a real ad
 * network is a separate piece of work that belongs behind a Content Security
 * Policy with an explicit script-src allowlist — which is Phase 8 — and not a
 * text field.
 *
 * ## Disclosure
 *
 * Every placement renders a label. Marking paid placements is a legal
 * requirement in most markets and an editorial one everywhere, so it is a
 * property of the component rather than something an editor can forget.
 */
export const Advertisements: CollectionConfig = {
  slug: 'advertisements',

  access: {
    /**
     * Public read. The renderer runs as an anonymous reader, and everything
     * here is about to be shown on a public page — the commercial terms behind
     * it are not in this collection.
     */
    read: () => true,
    create: hasCapability('ads:manage'),
    update: hasCapability('ads:manage'),
    delete: hasCapability('ads:manage'),
  },

  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'placement', 'advertiser', 'startsAt', 'endsAt', 'isActive'],
    group: 'Commercial',
    description: 'Booked placements. Creatives are images, never scripts.',
  },

  hooks: {
    // A campaign going live or ending changes every page it appears on.
    afterChange: [revalidateEntity('advertisement')],
  },

  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      admin: { description: 'Internal name, e.g. "Bank X — August leaderboard".' },
    },
    {
      name: 'advertiser',
      type: 'text',
      required: true,
      admin: { description: 'Who is paying. Shown to readers as part of the disclosure.' },
    },
    {
      name: 'placement',
      type: 'select',
      required: true,
      index: true,
      options: AD_PLACEMENTS.map((placement) => ({
        label:
          placement === 'leaderboard'
            ? 'Leaderboard — above the page content'
            : placement === 'in-article'
              ? 'In-article — after the story body'
              : 'Footer — above the site footer',
        value: placement,
      })),
      admin: { position: 'sidebar' },
    },

    // ------------------------------------------------------------- creative
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      required: true,
      admin: {
        description:
          'The creative. Needs alt text on the media record — it is what a screen reader announces.',
      },
    },
    {
      name: 'destinationUrl',
      type: 'text',
      required: true,
      admin: { description: 'Where the advertisement links to. Must be http or https.' },
      validate: (value: unknown) => {
        if (typeof value !== 'string' || value.length === 0) return 'A destination URL is required'
        try {
          const url = new URL(value)
          // The same protocol allowlist the redirect table uses, for the same
          // reason: a `javascript:` destination is script execution on click.
          if (url.protocol !== 'https:' && url.protocol !== 'http:') {
            return 'Only http and https destinations are allowed'
          }
          return true
        } catch {
          return 'Must be an absolute URL, including https://'
        }
      },
    },

    // ------------------------------------------------------------ scheduling
    {
      name: 'startsAt',
      type: 'date',
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Leave empty to run immediately.',
        date: { pickerAppearance: 'dayAndTime' },
      },
    },
    {
      name: 'endsAt',
      type: 'date',
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Leave empty to run until deactivated.',
        date: { pickerAppearance: 'dayAndTime' },
      },
    },
    {
      name: 'isActive',
      type: 'checkbox',
      defaultValue: true,
      index: true,
      admin: { position: 'sidebar', description: 'Uncheck to pause without losing the booking.' },
    },

    // ------------------------------------------------------------- targeting
    {
      /**
       * Named `languages`, not `locales`.
       *
       * A `hasMany` select generates a side table named `<collection>_<field>`,
       * and `advertisements_locales` is the name Payload reserves for a
       * collection's localised values. The collision does not fail at migration
       * time — it produces a table that looks right and then breaks *every*
       * read of the collection inside Drizzle with
       * `Cannot read properties of undefined (reading 'referencedTable')`.
       */
      name: 'languages',
      type: 'select',
      hasMany: true,
      options: LOCALES_LABEL,
      admin: {
        position: 'sidebar',
        description: 'Leave empty to run in every language.',
      },
    },
    {
      name: 'categories',
      type: 'relationship',
      relationTo: 'categories',
      hasMany: true,
      admin: {
        position: 'sidebar',
        description: 'Leave empty to run across the whole site.',
      },
    },
    {
      name: 'weight',
      type: 'number',
      defaultValue: 1,
      min: 0,
      admin: {
        position: 'sidebar',
        description:
          'Share of impressions relative to other ads in the same slot. Zero pauses it without changing the booking.',
      },
    },

    // ------------------------------------------------------------ provenance
    {
      name: 'createdBy',
      type: 'relationship',
      relationTo: 'users',
      index: true,
      admin: { readOnly: true, position: 'sidebar' },
      access: { update: () => false },
      hooks: {
        beforeChange: [
          ({ req, operation, value }): unknown => {
            if (operation !== 'create') return value
            return toAuthUser(req.user)?.id ?? value
          },
        ],
      },
    },
  ],

  timestamps: true,
}
