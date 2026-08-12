import {
  MAX_REDIRECT_HOPS,
  REDIRECT_STATUS,
  normaliseRedirectPath,
  parseRedirectTarget,
} from '@dhakalive/core'
import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'
import { APIError } from 'payload'

import { hasCapability, toAuthUser } from '../access'
import { env } from '../lib/env'

/**
 * URL redirects.
 *
 * Two sources feed this table. Editors add entries by hand — a section renamed,
 * a campaign URL, a story that moved — and the platform adds them automatically
 * when a published article's slug or section changes, which is the case that
 * previously left the old URL 404-ing for every reader who had bookmarked or
 * shared it.
 *
 * The security shape matters more here than in most collections. A redirect
 * table an editor can write to is an open-redirect vector wearing the
 * publication's domain, so destinations are validated rather than trusted: an
 * internal path, or an external URL on an explicitly allowed host, and nothing
 * else. `javascript:` and `data:` fail the protocol check rather than a
 * denylist, so an unfamiliar scheme is refused by default.
 */

/** Hosts an editor may redirect to. The site's own host is always included. */
function allowedHosts(): string[] {
  const siteUrl = env().NEXT_PUBLIC_SITE_URL
  const hosts = new Set<string>()

  try {
    hosts.add(new URL(siteUrl).host)
  } catch {
    // Environment validation already rejects a malformed site URL; nothing to
    // add here if it somehow gets through.
  }

  const media = env().CLOUDFLARE_MEDIA_PUBLIC_URL
  if (media) {
    try {
      hosts.add(new URL(media).host)
    } catch {
      // Same as above.
    }
  }

  return [...hosts]
}

/**
 * Validates and canonicalises both ends of a redirect, and refuses the two
 * shapes that break a chain: pointing at itself, and pointing at something that
 * already redirects back.
 *
 * The cycle check walks the persisted table rather than trusting the request,
 * because a loop is only ever created by the interaction of a new row with the
 * rows already there.
 */
const validateRedirect: CollectionBeforeChangeHook = async ({ data, req, originalDoc }) => {
  const from = normaliseRedirectPath(data.from)
  if (!from) {
    throw new APIError('The "from" value must be a site-relative path, for example /old-slug', 400)
  }

  const target = parseRedirectTarget(data.to, { allowedHosts: allowedHosts() })
  if (!target) {
    throw new APIError(
      'The "to" value must be a site-relative path or an https URL on an allowed host',
      400,
    )
  }

  const to = target.kind === 'internal' ? target.path : target.url

  if (target.kind === 'internal' && target.path === from) {
    throw new APIError('A redirect cannot point at itself', 400)
  }

  data.from = from
  data.to = to

  // An external destination ends the chain, so there is nothing to walk.
  if (target.kind === 'external') return data

  const selfId = (originalDoc as { id?: unknown } | undefined)?.id
  let cursor = target.path

  for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop += 1) {
    const next = await req.payload.find({
      collection: 'redirects',
      where: {
        and: [
          { from: { equals: cursor } },
          { isActive: { not_equals: false } },
          ...(selfId === undefined ? [] : [{ id: { not_equals: selfId } }]),
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })

    const found = next.docs[0]
    if (!found) return data

    if (found.to === from) {
      throw new APIError(
        `That destination already redirects back to ${from}, which would loop`,
        400,
      )
    }

    cursor = found.to
  }

  throw new APIError(
    `That destination is more than ${MAX_REDIRECT_HOPS} redirects deep; point it at the final URL instead`,
    400,
  )
}

export const Redirects: CollectionConfig = {
  slug: 'redirects',

  access: {
    // Public read: resolving a redirect happens for anonymous readers, and the
    // table contains nothing that is not already a public URL.
    read: () => true,
    create: hasCapability('redirect:manage'),
    update: hasCapability('redirect:manage'),
    delete: hasCapability('redirect:manage'),
  },

  admin: {
    useAsTitle: 'from',
    defaultColumns: ['from', 'to', 'permanence', 'source', 'isActive', 'updatedAt'],
    group: 'Administration',
    description: 'Old URLs and where they should now go.',
  },

  hooks: {
    beforeChange: [validateRedirect],
  },

  fields: [
    {
      name: 'from',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        description:
          'The old path as a reader would type it — /politics/old-slug. Bengali is served without a locale prefix, so do not include /bn. Query strings are ignored.',
      },
    },
    {
      name: 'to',
      type: 'text',
      required: true,
      admin: {
        description: 'A path on this site, or an https URL on an allowed host.',
      },
    },
    {
      /**
       * Permanence, not a status code.
       *
       * Next's `redirect()` and `permanentRedirect()` emit 307 and 308; a field
       * offering 301 or 302 would have been a choice the platform then ignored.
       * 308 is treated by search engines exactly as 301, so the only thing lost
       * is the pretence.
       */
      name: 'permanence',
      type: 'select',
      required: true,
      // Permanent by default: a moved story has moved, and a temporary redirect
      // leaves the old URL in search results indefinitely.
      defaultValue: 'permanent',
      options: [
        { label: `Permanent (${REDIRECT_STATUS.permanent})`, value: 'permanent' },
        { label: `Temporary (${REDIRECT_STATUS.temporary})`, value: 'temporary' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'isActive',
      type: 'checkbox',
      defaultValue: true,
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Uncheck to disable without deleting the record.',
      },
    },
    {
      name: 'source',
      type: 'select',
      required: true,
      defaultValue: 'manual',
      options: [
        { label: 'Added by an editor', value: 'manual' },
        { label: 'Created automatically', value: 'automatic' },
      ],
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Automatic entries are created when a published URL changes.',
      },
    },
    {
      name: 'note',
      type: 'textarea',
      admin: { description: 'Why this redirect exists. Useful when auditing the table later.' },
    },
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
