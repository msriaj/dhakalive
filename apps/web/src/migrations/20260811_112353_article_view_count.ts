import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_homepage_sections_source" ADD VALUE 'most-viewed' BEFORE 'type';
  ALTER TYPE "public"."enum_homepage_side_source" ADD VALUE 'most-viewed' BEFORE 'type';
  ALTER TYPE "public"."enum_homepage_rail_source" ADD VALUE 'most-viewed' BEFORE 'type';
  ALTER TYPE "public"."enum_homepage_sub_leads_source" ADD VALUE 'most-viewed' BEFORE 'type';
  ALTER TABLE "articles" ADD COLUMN "view_count" numeric DEFAULT 0;
  ALTER TABLE "_articles_v" ADD COLUMN "version_view_count" numeric DEFAULT 0;
  CREATE INDEX "articles_view_count_idx" ON "articles" USING btree ("view_count");
  CREATE INDEX "_articles_v_version_version_view_count_idx" ON "_articles_v" USING btree ("version_view_count");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "homepage_sections" ALTER COLUMN "source" SET DATA TYPE text;
  ALTER TABLE "homepage_sections" ALTER COLUMN "source" SET DEFAULT 'category'::text;
  DROP TYPE "public"."enum_homepage_sections_source";
  CREATE TYPE "public"."enum_homepage_sections_source" AS ENUM('category', 'manual', 'latest', 'type', 'collections');
  ALTER TABLE "homepage_sections" ALTER COLUMN "source" SET DEFAULT 'category'::"public"."enum_homepage_sections_source";
  ALTER TABLE "homepage_sections" ALTER COLUMN "source" SET DATA TYPE "public"."enum_homepage_sections_source" USING "source"::"public"."enum_homepage_sections_source";
  ALTER TABLE "homepage" ALTER COLUMN "side_source" SET DATA TYPE text;
  ALTER TABLE "homepage" ALTER COLUMN "side_source" SET DEFAULT 'manual'::text;
  DROP TYPE "public"."enum_homepage_side_source";
  CREATE TYPE "public"."enum_homepage_side_source" AS ENUM('manual', 'category', 'latest', 'type');
  ALTER TABLE "homepage" ALTER COLUMN "side_source" SET DEFAULT 'manual'::"public"."enum_homepage_side_source";
  ALTER TABLE "homepage" ALTER COLUMN "side_source" SET DATA TYPE "public"."enum_homepage_side_source" USING "side_source"::"public"."enum_homepage_side_source";
  ALTER TABLE "homepage" ALTER COLUMN "rail_source" SET DATA TYPE text;
  ALTER TABLE "homepage" ALTER COLUMN "rail_source" SET DEFAULT 'manual'::text;
  DROP TYPE "public"."enum_homepage_rail_source";
  CREATE TYPE "public"."enum_homepage_rail_source" AS ENUM('manual', 'category', 'latest', 'type');
  ALTER TABLE "homepage" ALTER COLUMN "rail_source" SET DEFAULT 'manual'::"public"."enum_homepage_rail_source";
  ALTER TABLE "homepage" ALTER COLUMN "rail_source" SET DATA TYPE "public"."enum_homepage_rail_source" USING "rail_source"::"public"."enum_homepage_rail_source";
  ALTER TABLE "homepage" ALTER COLUMN "sub_leads_source" SET DATA TYPE text;
  ALTER TABLE "homepage" ALTER COLUMN "sub_leads_source" SET DEFAULT 'manual'::text;
  DROP TYPE "public"."enum_homepage_sub_leads_source";
  CREATE TYPE "public"."enum_homepage_sub_leads_source" AS ENUM('manual', 'category', 'latest', 'type');
  ALTER TABLE "homepage" ALTER COLUMN "sub_leads_source" SET DEFAULT 'manual'::"public"."enum_homepage_sub_leads_source";
  ALTER TABLE "homepage" ALTER COLUMN "sub_leads_source" SET DATA TYPE "public"."enum_homepage_sub_leads_source" USING "sub_leads_source"::"public"."enum_homepage_sub_leads_source";
  DROP INDEX "articles_view_count_idx";
  DROP INDEX "_articles_v_version_version_view_count_idx";
  ALTER TABLE "articles" DROP COLUMN "view_count";
  ALTER TABLE "_articles_v" DROP COLUMN "version_view_count";`)
}
