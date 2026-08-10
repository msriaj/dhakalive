import type { GlobalConfig } from 'payload'

import { hasCapability } from '../access'

/**
 * Site-wide metadata fallbacks.
 *
 * Per-document `seo` fields override these; everything here is what renders when
 * an editor has not overridden anything, which is the common case.
 */
export const SeoDefaults: GlobalConfig = {
  slug: 'seo-defaults',

  access: {
    read: () => true,
    update: hasCapability('globals:manage.system'),
  },

  admin: { group: 'Settings' },

  fields: [
    {
      name: 'titleTemplate',
      type: 'text',
      defaultValue: '%s — DhakaLive',
      admin: { description: '%s is replaced by the page title.' },
    },
    {
      name: 'defaultTitle',
      type: 'text',
      localized: true,
      admin: { description: 'Used for pages with no title of their own.' },
    },
    {
      name: 'defaultDescription',
      type: 'textarea',
      localized: true,
      maxLength: 200,
    },
    {
      name: 'defaultImage',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'Open Graph fallback. 1200×630 renders best.' },
    },
    {
      name: 'twitterHandle',
      type: 'text',
      admin: { description: 'Including the @.' },
    },
    {
      name: 'allowIndexing',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description: 'Uncheck to add a site-wide noindex. Intended for staging environments only.',
      },
    },
  ],
}
