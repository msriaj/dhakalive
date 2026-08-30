import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

/**
 * Widens `search_documents.url` and `image_url` from varchar(512) to text.
 *
 * Bengali slugs are percent-encoded at the URL boundary, and each Bengali
 * character encodes to nine bytes (`র` → `%E0%A6%B0`). A headline-length slug
 * plus its category clears 512 comfortably, at which point every search-index
 * job for that article dead-letters with "value too long for type character
 * varying(512)". A URL column has no business enforcing a length: nothing
 * indexes it, and the value is data, not a key.
 *
 * Hand-written like the table it alters — Payload has never seen
 * `search_documents` and must not start now.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "search_documents" ALTER COLUMN "url" TYPE text;
    ALTER TABLE "search_documents" ALTER COLUMN "image_url" TYPE text;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  /**
   * Truncate rather than fail: rows written while the columns were text may
   * exceed 512, and a down migration that cannot run is worse than one that
   * clips a projection column. The index is rebuildable with `pnpm reindex`.
   */
  await db.execute(sql`
    ALTER TABLE "search_documents" ALTER COLUMN "url" TYPE varchar(512) USING left("url", 512);
    ALTER TABLE "search_documents" ALTER COLUMN "image_url" TYPE varchar(512) USING left("image_url", 512);
  `)
}
