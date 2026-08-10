import type { CollectionConfig } from 'payload'

import { hasCapability } from '../access'

/**
 * Presentation and access for Payload's built-in `payload-jobs` collection.
 *
 * The table is the dead-letter queue. Payload stops retrying a job once its
 * attempts are exhausted and leaves the row behind with `hasError` set and the
 * full per-attempt log attached; `prune-jobs` removes completed jobs on a
 * retention window and never touches failed ones. So "what is stuck?" is
 * `hasError: true` in this list, with the error and every attempt in one place,
 * rather than a second table that would have to be kept in step with this one.
 *
 * Read is restricted to `audit:read` — administrators. Job inputs quote document
 * ids, slugs and correlation ids, and a queue view is an unusually good map of
 * what a newsroom is about to publish.
 */
export function jobsCollectionOverrides({
  defaultJobsCollection,
}: {
  defaultJobsCollection: CollectionConfig
}): CollectionConfig {
  return {
    ...defaultJobsCollection,

    access: {
      ...defaultJobsCollection.access,
      read: hasCapability('audit:read'),
      create: () => false,
      update: () => false,
      // Deleting a failed job discards the only record of why it failed, so it
      // is held at the same level as deleting an audit record.
      delete: hasCapability('audit:delete'),
    },

    admin: {
      ...defaultJobsCollection.admin,
      group: 'Administration',
      description:
        'Background work. Rows with an error have exhausted their retries and need attention.',
      defaultColumns: ['id', 'taskSlug', 'queue', 'hasError', 'totalTried', 'createdAt'],
      /**
       * The job runner talks to the database directly rather than through the
       * collection, so hiding this from non-administrators costs nothing
       * operationally — and an editor has no action to take here.
       */
      hidden: defaultJobsCollection.admin?.hidden,
    },
  }
}
