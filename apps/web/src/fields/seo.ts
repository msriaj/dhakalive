import type { Field } from 'payload'

/**
 * Per-document SEO overrides.
 *
 * Every field is optional by design: defaults are derived at render time from
 * the document itself (headline, summary, featured image) and from the SEO
 * defaults global. These exist so an editor can override a specific page
 * without having to fill in metadata for every routine story.
 */
export function seoField(options: { descriptionHint?: string } = {}): Field {
  const { descriptionHint = 'Leave blank to derive metadata from the content itself.' } = options

  return {
    name: 'seo',
    type: 'group',
    label: 'SEO',
    admin: { description: descriptionHint },
    fields: [
      {
        name: 'title',
        type: 'text',
        localized: true,
        maxLength: 70,
        admin: { description: 'Overrides the page title. Around 60 characters renders best.' },
      },
      {
        name: 'description',
        type: 'textarea',
        localized: true,
        maxLength: 200,
        admin: { description: 'Overrides the meta description. Around 155 characters.' },
      },
      {
        name: 'image',
        type: 'upload',
        relationTo: 'media',
        admin: { description: 'Overrides the Open Graph image. Falls back to the featured image.' },
      },
      {
        name: 'canonicalUrl',
        type: 'text',
        admin: {
          description:
            'Absolute URL. Set this only when this page is a duplicate of a canonical page elsewhere.',
        },
        validate: (value: unknown) => {
          if (!value) return true
          if (typeof value !== 'string') return 'Must be a URL'
          try {
            const url = new URL(value)
            // A canonical pointing at javascript: or data: is an injection vector.
            if (url.protocol !== 'https:' && url.protocol !== 'http:') {
              return 'Canonical URLs must be http or https'
            }
            return true
          } catch {
            return 'Must be an absolute URL, including https://'
          }
        },
      },
      {
        name: 'noIndex',
        type: 'checkbox',
        defaultValue: false,
        admin: { description: 'Ask search engines not to index this page.' },
      },
    ],
  }
}
