import type { GlobalConfig } from 'payload'

import { hasCapability } from '../access'
import { revalidateGlobal } from '../hooks/revalidate'

/**
 * Organisation-level settings.
 *
 * Reserved for administrators (`globals:manage.system`): these values feed
 * structured data and the canonical identity of the publication, so an
 * accidental edit is a site-wide SEO event rather than an editorial one.
 */
export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',

  access: {
    read: () => true,
    update: hasCapability('globals:manage.system'),
  },

  admin: { group: 'Settings' },

  hooks: {
    afterChange: [revalidateGlobal('site-settings')],
  },

  fields: [
    {
      name: 'siteName',
      type: 'text',
      required: true,
      localized: true,
      defaultValue: 'DhakaLive',
    },
    {
      name: 'tagline',
      type: 'text',
      localized: true,
    },
    {
      name: 'logo',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'organization',
      type: 'group',
      label: 'Publisher identity',
      admin: { description: 'Used for Organization structured data.' },
      fields: [
        { name: 'legalName', type: 'text' },
        { name: 'foundingDate', type: 'date' },
        {
          name: 'sameAs',
          type: 'array',
          labels: { singular: 'Profile URL', plural: 'Profile URLs' },
          admin: { description: 'Wikipedia, Wikidata or official profiles.' },
          fields: [{ name: 'url', type: 'text', required: true }],
        },
      ],
    },
    {
      name: 'contact',
      type: 'group',
      fields: [
        { name: 'email', type: 'email' },
        { name: 'phone', type: 'text' },
        { name: 'address', type: 'textarea', localized: true },
        {
          name: 'newsroomEmail',
          type: 'email',
          admin: { description: 'Tips and corrections address, shown on articles.' },
        },
      ],
    },
    {
      name: 'social',
      type: 'array',
      labels: { singular: 'Social link', plural: 'Social links' },
      fields: [
        {
          name: 'platform',
          type: 'select',
          required: true,
          options: [
            { label: 'Facebook', value: 'facebook' },
            { label: 'X (Twitter)', value: 'x' },
            { label: 'YouTube', value: 'youtube' },
            { label: 'Instagram', value: 'instagram' },
            { label: 'LinkedIn', value: 'linkedin' },
            { label: 'WhatsApp', value: 'whatsapp' },
          ],
        },
        { name: 'url', type: 'text', required: true },
      ],
    },
  ],
}
