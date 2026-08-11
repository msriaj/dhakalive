import 'server-only'

import { sql } from '@payloadcms/db-postgres'

import { getPayloadClient } from './client'

/**
 * Records one view of one article.
 *
 * A bare `UPDATE`, not `payload.update`, and the difference is the whole point.
 * Going through Payload would run the article's `afterChange` hooks on every
 * view — purging the CDN and queueing a search reindex for a page whose content
 * has not changed — and, because the collection has drafts enabled, write a
 * version row per view until the versions table dwarfed the articles in it. A
 * view is not an edit and must not be recorded as one.
 *
 * `view_count = view_count + 1` is computed by Postgres rather than read into
 * the application and written back, so two readers arriving in the same
 * millisecond both count. It is also why this cannot lose a count to a race
 * without losing the whole statement.
 *
 * The row is matched on `_status` so a draft cannot be counted: the id comes
 * from a browser, and an id that is not a published article should do nothing
 * rather than tell the caller it exists.
 */
export async function recordView(articleId: number): Promise<boolean> {
  const payload = await getPayloadClient()

  const result = await payload.db.drizzle.execute(sql`
    UPDATE "articles"
    SET "view_count" = COALESCE("view_count", 0) + 1
    WHERE "id" = ${articleId} AND "_status" = 'published'
  `)

  // `rowCount` is null for statements that cannot report one; treat that as a
  // miss rather than claiming a write we cannot confirm.
  return (result as { rowCount?: number | null }).rowCount === 1
}
