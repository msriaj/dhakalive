import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "articles" ADD COLUMN "source_provider" varchar;
  ALTER TABLE "articles" ADD COLUMN "source_external_id" varchar;
  ALTER TABLE "articles" ADD COLUMN "source_source_url" varchar;
  ALTER TABLE "articles" ADD COLUMN "source_generated_at" timestamp(3) with time zone;
  ALTER TABLE "_articles_v" ADD COLUMN "version_source_provider" varchar;
  ALTER TABLE "_articles_v" ADD COLUMN "version_source_external_id" varchar;
  ALTER TABLE "_articles_v" ADD COLUMN "version_source_source_url" varchar;
  ALTER TABLE "_articles_v" ADD COLUMN "version_source_generated_at" timestamp(3) with time zone;
  CREATE INDEX "articles_source_source_provider_idx" ON "articles" USING btree ("source_provider");
  CREATE INDEX "articles_source_source_external_id_idx" ON "articles" USING btree ("source_external_id");
  CREATE INDEX "_articles_v_version_source_version_source_provider_idx" ON "_articles_v" USING btree ("version_source_provider");
  CREATE INDEX "_articles_v_version_source_version_source_external_id_idx" ON "_articles_v" USING btree ("version_source_external_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "articles_source_source_provider_idx";
  DROP INDEX "articles_source_source_external_id_idx";
  DROP INDEX "_articles_v_version_source_version_source_provider_idx";
  DROP INDEX "_articles_v_version_source_version_source_external_id_idx";
  ALTER TABLE "articles" DROP COLUMN "source_provider";
  ALTER TABLE "articles" DROP COLUMN "source_external_id";
  ALTER TABLE "articles" DROP COLUMN "source_source_url";
  ALTER TABLE "articles" DROP COLUMN "source_generated_at";
  ALTER TABLE "_articles_v" DROP COLUMN "version_source_provider";
  ALTER TABLE "_articles_v" DROP COLUMN "version_source_external_id";
  ALTER TABLE "_articles_v" DROP COLUMN "version_source_source_url";
  ALTER TABLE "_articles_v" DROP COLUMN "version_source_generated_at";`)
}
