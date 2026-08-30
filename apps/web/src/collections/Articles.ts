import {
  ARTICLE_STATUSES,
  ARTICLE_TYPES,
  PRE_PUBLICATION_STATUSES,
  can,
  type ArticleStatus,
  type ArticleType,
} from '@dhakalive/core'
import type { CollectionConfig, Where } from 'payload'

import { hasCapability, toAuthUser } from '../access'
import { seoField } from '../fields/seo'
import { slugField } from '../fields/slug'
import { enforceArticleWorkflow } from '../hooks/article-workflow'
import { recordArticleRedirect } from '../hooks/redirects'
import { revalidateArticle, revalidateArticleDeletion } from '../hooks/revalidate'
import { deindexOnDelete, indexOnChange } from '../hooks/search'
import { queueSocialPhotocard } from '../hooks/social'

const TYPE_LABELS: Record<ArticleType, string> = {
  standard: 'Standard article',
  'breaking-news': 'Breaking news',
  opinion: 'Opinion',
  editorial: 'Editorial',
  feature: 'Feature',
  interview: 'Interview',
  analysis: 'Analysis',
  'photo-story': 'Photo story',
  'video-story': 'Video story',
  'live-blog': 'Live blog',
}

const STATUS_LABELS: Record<ArticleStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  'in-review': 'In review',
  'changes-requested': 'Changes requested',
  approved: 'Approved',
  scheduled: 'Scheduled',
  published: 'Published',
  unpublished: 'Unpublished',
  archived: 'Archived',
}

export const Articles: CollectionConfig = {
  slug: 'articles',

  access: {
    /**
     * Returned as a query constraint rather than a post-filter, so Payload
     * turns it into SQL and it applies identically to REST, GraphQL, the Local
     * API and the admin list view. This is what stops a reporter reading
     * another reporter's draft through a direct API call.
     */
    read: ({ req }) => {
      const publishedOnly: Where = { workflowStatus: { equals: 'published' } }

      const user = toAuthUser(req.user)
      if (!user) return publishedOnly
      if (can(user, 'article:read.any')) return true

      const ownWork: Where = { createdBy: { equals: user.id } }
      return { or: [publishedOnly, ownWork] } satisfies Where
    },

    create: hasCapability('article:create'),

    update: ({ req }) => {
      const user = toAuthUser(req.user)
      if (!user) return false
      if (can(user, 'article:update.any')) return true
      if (!can(user, 'article:update.own')) return false

      // Own work, and only while it has never been published. The status
      // transition itself is authorised separately by the workflow hook.
      const ownWork: Where = { createdBy: { equals: user.id } }
      const neverPublished: Where = { workflowStatus: { in: [...PRE_PUBLICATION_STATUSES] } }
      return { and: [ownWork, neverPublished] } satisfies Where
    },

    delete: ({ req }) => {
      const user = toAuthUser(req.user)
      if (!user) return false
      if (can(user, 'article:delete.any')) return true
      if (!can(user, 'article:delete.own')) return false

      // Authors may discard their own drafts, nothing further along.
      const ownWork: Where = { createdBy: { equals: user.id } }
      const stillADraft: Where = { workflowStatus: { equals: 'draft' } }
      return { and: [ownWork, stillADraft] } satisfies Where
    },
  },

  admin: {
    useAsTitle: 'headline',
    defaultColumns: ['headline', 'workflowStatus', 'articleType', 'primaryCategory', 'publishedAt'],
    group: 'Content',
    listSearchableFields: ['headline', 'summary'],
  },

  /**
   * Payload drafts provide autosave and version history. `_status` is derived
   * from the editorial `status` in the workflow hook rather than being set
   * independently — see the comment there.
   */
  versions: {
    drafts: {
      autosave: { interval: 800 },
      schedulePublish: false,
    },
    maxPerDoc: 50,
  },

  hooks: {
    beforeChange: [enforceArticleWorkflow],
    afterChange: [
      recordArticleRedirect,
      revalidateArticle,
      indexOnChange('articles'),
      queueSocialPhotocard,
    ],
    afterDelete: [revalidateArticleDeletion, deindexOnDelete('articles')],
  },

  fields: [
    // ---------------------------------------------------------------- content
    {
      name: 'headline',
      type: 'text',
      required: true,
      localized: true,
      index: true,
    },
    {
      name: 'subheadline',
      type: 'text',
      localized: true,
    },
    slugField({ sourceField: 'headline', localized: true }),
    {
      name: 'summary',
      type: 'textarea',
      localized: true,
      maxLength: 400,
      admin: { description: 'Used in listings, social cards and search results.' },
    },
    {
      name: 'body',
      type: 'richText',
      localized: true,
    },

    // ------------------------------------------------------------ attribution
    {
      name: 'authors',
      type: 'relationship',
      relationTo: 'authors',
      hasMany: true,
      index: true,
      admin: { description: 'Bylines, in the order they should appear.' },
    },
    {
      name: 'primaryCategory',
      type: 'relationship',
      relationTo: 'categories',
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Determines the article URL and its position in navigation.',
      },
    },
    {
      name: 'categories',
      type: 'relationship',
      relationTo: 'categories',
      hasMany: true,
      admin: { position: 'sidebar', description: 'Additional sections this story belongs to.' },
    },
    {
      name: 'tags',
      type: 'relationship',
      relationTo: 'tags',
      hasMany: true,
      admin: { position: 'sidebar' },
    },

    // ------------------------------------------------------------------ media
    {
      name: 'featuredImage',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description: 'Required to publish, and it must already have alt text.',
      },
    },

    // --------------------------------------------------------------- workflow
    {
      name: 'articleType',
      type: 'select',
      required: true,
      defaultValue: 'standard',
      index: true,
      options: ARTICLE_TYPES.map((type) => ({ label: TYPE_LABELS[type], value: type })),
      admin: { position: 'sidebar' },
    },
    {
      /**
       * Named `workflowStatus`, not `status`.
       *
       * Payload's drafts feature owns a reserved `_status` field (draft |
       * published). With versions enabled, a sibling field called `status`
       * collides with it when Postgres enum names are generated for the
       * versions table, and every editorial value beyond draft/published is
       * rejected at the database level. The distinct name also keeps the two
       * concepts legible: `_status` is storage, `workflowStatus` is editorial.
       */
      name: 'workflowStatus',
      label: 'Editorial status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      index: true,
      options: ARTICLE_STATUSES.map((status) => ({ label: STATUS_LABELS[status], value: status })),
      admin: {
        position: 'sidebar',
        description: 'Only transitions allowed by your role are accepted.',
      },
    },
    {
      name: 'workflowNote',
      type: 'textarea',
      admin: {
        position: 'sidebar',
        description:
          'Reason for this status change, e.g. what needs fixing. Recorded against the transition.',
      },
    },
    {
      name: 'workflowHistory',
      type: 'array',
      admin: {
        readOnly: true,
        position: 'sidebar',
        description: 'Every status change, who made it and when.',
      },
      access: {
        // Written only by the workflow hook. An editable audit trail is not one.
        create: () => false,
        update: () => false,
      },
      fields: [
        { name: 'from', type: 'text' },
        { name: 'to', type: 'text' },
        { name: 'at', type: 'date' },
        { name: 'actor', type: 'relationship', relationTo: 'users' },
        { name: 'note', type: 'textarea' },
      ],
    },

    // ------------------------------------------------------------- scheduling
    {
      name: 'publishedAt',
      type: 'date',
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Set automatically on first publication.',
        date: { pickerAppearance: 'dayAndTime' },
      },
    },
    {
      name: 'scheduledAt',
      type: 'date',
      index: true,
      admin: {
        position: 'sidebar',
        description: 'When a scheduled article should go live. Published by the background worker.',
        date: { pickerAppearance: 'dayAndTime' },
      },
    },

    /**
     * Views, counted for ordering and nothing else.
     *
     * Written by `/api/view` with a bare `UPDATE`, deliberately outside
     * Payload: a `payload.update` here would run the article's `afterChange`
     * hooks on every single view — purging the CDN and reindexing search for a
     * page that has not changed — and, with drafts enabled, write a version row
     * per view until the table dwarfed the articles in it.
     *
     * Read-only in the admin for the same reason it is approximate: it is a
     * measurement, not an editorial field, and an editor who can type a number
     * into it has a "most read" list that means whatever they typed.
     */
    {
      name: 'viewCount',
      type: 'number',
      defaultValue: 0,
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Approximate. Counted once per reader per session, browsers only.',
      },
    },

    // ---------------------------------------------------------------- flagging
    {
      name: 'isBreaking',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      admin: { position: 'sidebar', description: 'Shows in the breaking-news ticker.' },
    },
    {
      name: 'breakingUntil',
      type: 'date',
      admin: {
        position: 'sidebar',
        description: 'When the breaking flag expires. Cleared by the worker.',
        condition: (data: Record<string, unknown>) => Boolean(data?.isBreaking),
        date: { pickerAppearance: 'dayAndTime' },
      },
    },
    {
      name: 'isFeatured',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      admin: { position: 'sidebar' },
    },

    // ------------------------------------------------------------ translation
    {
      name: 'translationOf',
      type: 'relationship',
      relationTo: 'articles',
      index: true,
      admin: {
        position: 'sidebar',
        description:
          'Links this story to the same story written separately in another language. Leave empty when both languages live in this document as translated fields.',
      },
    },

    // ------------------------------------------------------------- corrections
    {
      name: 'correction',
      type: 'group',
      fields: [
        { name: 'hasCorrection', type: 'checkbox', defaultValue: false },
        {
          name: 'note',
          type: 'textarea',
          localized: true,
          admin: {
            description: 'Shown to readers on the article. Say what was wrong and what changed.',
            condition: (_data: unknown, siblingData: Record<string, unknown>) =>
              Boolean(siblingData?.hasCorrection),
          },
        },
        {
          name: 'correctedAt',
          type: 'date',
          admin: {
            condition: (_data: unknown, siblingData: Record<string, unknown>) =>
              Boolean(siblingData?.hasCorrection),
          },
        },
      ],
    },

    // ----------------------------------------------------------- social posts
    /**
     * Record of the automatic Facebook photocard, written by the worker after a
     * successful post. It doubles as the dedupe guard: the photocard task
     * refuses to post an article that already carries a timestamp, so clearing
     * these fields is also how an admin deliberately re-posts one.
     */
    {
      name: 'socialPosts',
      type: 'group',
      admin: {
        position: 'sidebar',
        description: 'Automatic social publication, recorded by the background worker.',
      },
      fields: [
        {
          name: 'facebookPostedAt',
          type: 'date',
          admin: { readOnly: true, description: 'When the photocard was posted.' },
        },
        {
          name: 'facebookPostUrl',
          type: 'text',
          admin: { readOnly: true, description: 'The published Facebook post.' },
        },
      ],
    },

    // ------------------------------------------------------------- provenance
    {
      name: 'createdBy',
      type: 'relationship',
      relationTo: 'users',
      index: true,
      admin: { readOnly: true, position: 'sidebar' },
      access: { update: () => false },
    },
    {
      name: 'lastEditedBy',
      type: 'relationship',
      relationTo: 'users',
      admin: { readOnly: true, position: 'sidebar' },
      access: { update: () => false },
    },

    /**
     * Where an automatically ingested article came from.
     *
     * Two jobs, and both are load-bearing. `externalId` is the dedupe key: the
     * ingest sweep runs every few minutes against a feed that mostly has not
     * changed, and without an indexed identity to check first it would either
     * re-create every story on every run or pay a language model to rediscover
     * that it already had them.
     *
     * `provider` and `generatedAt` are the provenance record. "Was this written
     * by a machine, and from what" is a question that gets asked months later —
     * after a correction, or by a reader — and the answer has to be a column
     * rather than an inference from which user account happened to save it.
     *
     * Not `readOnly`: an editor rewriting an ingested story past recognition
     * should be able to detach it from its source.
     */
    {
      name: 'source',
      type: 'group',
      admin: {
        position: 'sidebar',
        description: 'Set by the ingest pipeline. Empty for anything written in-house.',
      },
      fields: [
        {
          name: 'provider',
          type: 'text',
          index: true,
          admin: { description: 'The feed this story was ingested from.' },
        },
        {
          name: 'externalId',
          type: 'text',
          index: true,
          admin: { description: 'Stable id at the source. Used to avoid re-ingesting.' },
        },
        {
          name: 'sourceUrl',
          type: 'text',
          admin: { description: 'The page this story was derived from.' },
        },
        {
          name: 'generatedAt',
          type: 'date',
          admin: { description: 'When the rewrite was generated.' },
        },
      ],
    },

    seoField(),
  ],

  timestamps: true,
}
