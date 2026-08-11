import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

/**
 * The three lead columns become groups that choose where their stories come
 * from, instead of being three lists an editor refills by hand every morning.
 *
 * `sideStories`, `secondaryLeads` and `subLeads` were plain `hasMany`
 * relationships, so their rows live in `homepage_rels` keyed by a `path` string
 * — and moving a relationship inside a group changes that string. The generator
 * cannot see this: paths are data, not schema, so nothing in the diff mentions
 * them, and the columns would come up empty on a database that already had
 * stories in them. The three `UPDATE`s are the point of this file; the
 * generated column additions are the easy half.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_homepage_side_article_types" AS ENUM('standard', 'breaking-news', 'opinion', 'editorial', 'feature', 'interview', 'analysis', 'photo-story', 'video-story', 'live-blog');
  CREATE TYPE "public"."enum_homepage_rail_article_types" AS ENUM('standard', 'breaking-news', 'opinion', 'editorial', 'feature', 'interview', 'analysis', 'photo-story', 'video-story', 'live-blog');
  CREATE TYPE "public"."enum_homepage_sub_leads_article_types" AS ENUM('standard', 'breaking-news', 'opinion', 'editorial', 'feature', 'interview', 'analysis', 'photo-story', 'video-story', 'live-blog');
  CREATE TYPE "public"."enum_homepage_side_source" AS ENUM('manual', 'category', 'latest', 'type');
  CREATE TYPE "public"."enum_homepage_rail_source" AS ENUM('manual', 'category', 'latest', 'type');
  CREATE TYPE "public"."enum_homepage_sub_leads_source" AS ENUM('manual', 'category', 'latest', 'type');
  CREATE TABLE "homepage_side_article_types" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_homepage_side_article_types",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "homepage_rail_article_types" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_homepage_rail_article_types",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "homepage_sub_leads_article_types" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_homepage_sub_leads_article_types",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  ALTER TABLE "homepage" ADD COLUMN "side_source" "enum_homepage_side_source" DEFAULT 'manual' NOT NULL;
  ALTER TABLE "homepage" ADD COLUMN "side_category_id" integer;
  ALTER TABLE "homepage" ADD COLUMN "side_limit" numeric DEFAULT 4;
  ALTER TABLE "homepage" ADD COLUMN "rail_source" "enum_homepage_rail_source" DEFAULT 'manual' NOT NULL;
  ALTER TABLE "homepage" ADD COLUMN "rail_category_id" integer;
  ALTER TABLE "homepage" ADD COLUMN "rail_limit" numeric DEFAULT 4;
  ALTER TABLE "homepage" ADD COLUMN "sub_leads_source" "enum_homepage_sub_leads_source" DEFAULT 'manual' NOT NULL;
  ALTER TABLE "homepage" ADD COLUMN "sub_leads_category_id" integer;
  ALTER TABLE "homepage" ADD COLUMN "sub_leads_limit" numeric DEFAULT 4;
  ALTER TABLE "homepage" ADD COLUMN "editors_picks_enabled" boolean DEFAULT true;
  ALTER TABLE "homepage_side_article_types" ADD CONSTRAINT "homepage_side_article_types_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."homepage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "homepage_rail_article_types" ADD CONSTRAINT "homepage_rail_article_types_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."homepage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "homepage_sub_leads_article_types" ADD CONSTRAINT "homepage_sub_leads_article_types_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."homepage"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "homepage_side_article_types_order_idx" ON "homepage_side_article_types" USING btree ("order");
  CREATE INDEX "homepage_side_article_types_parent_idx" ON "homepage_side_article_types" USING btree ("parent_id");
  CREATE INDEX "homepage_rail_article_types_order_idx" ON "homepage_rail_article_types" USING btree ("order");
  CREATE INDEX "homepage_rail_article_types_parent_idx" ON "homepage_rail_article_types" USING btree ("parent_id");
  CREATE INDEX "homepage_sub_leads_article_types_order_idx" ON "homepage_sub_leads_article_types" USING btree ("order");
  CREATE INDEX "homepage_sub_leads_article_types_parent_idx" ON "homepage_sub_leads_article_types" USING btree ("parent_id");
  ALTER TABLE "homepage" ADD CONSTRAINT "homepage_side_category_id_categories_id_fk" FOREIGN KEY ("side_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "homepage" ADD CONSTRAINT "homepage_rail_category_id_categories_id_fk" FOREIGN KEY ("rail_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "homepage" ADD CONSTRAINT "homepage_sub_leads_category_id_categories_id_fk" FOREIGN KEY ("sub_leads_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "homepage_side_side_category_idx" ON "homepage" USING btree ("side_category_id");
  CREATE INDEX "homepage_rail_rail_category_idx" ON "homepage" USING btree ("rail_category_id");
  CREATE INDEX "homepage_sub_leads_sub_leads_category_idx" ON "homepage" USING btree ("sub_leads_category_id");

  UPDATE "homepage_rels" SET "path" = 'side.articles' WHERE "path" = 'sideStories';
  UPDATE "homepage_rels" SET "path" = 'rail.articles' WHERE "path" = 'secondaryLeads';
  UPDATE "homepage_rels" SET "path" = 'subLeads.articles' WHERE "path" = 'subLeads';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   /*
    * Paths first, while the groups still exist. A column an editor had switched
    * to a category or an article type has no hand-picked list to put back, so it
    * comes down empty — the old shape cannot express a queried column.
    */
  UPDATE "homepage_rels" SET "path" = 'sideStories' WHERE "path" = 'side.articles';
  UPDATE "homepage_rels" SET "path" = 'secondaryLeads' WHERE "path" = 'rail.articles';
  UPDATE "homepage_rels" SET "path" = 'subLeads' WHERE "path" = 'subLeads.articles';

  ALTER TABLE "homepage_side_article_types" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "homepage_rail_article_types" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "homepage_sub_leads_article_types" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "homepage_side_article_types" CASCADE;
  DROP TABLE "homepage_rail_article_types" CASCADE;
  DROP TABLE "homepage_sub_leads_article_types" CASCADE;
  ALTER TABLE "homepage" DROP CONSTRAINT "homepage_side_category_id_categories_id_fk";
  
  ALTER TABLE "homepage" DROP CONSTRAINT "homepage_rail_category_id_categories_id_fk";
  
  ALTER TABLE "homepage" DROP CONSTRAINT "homepage_sub_leads_category_id_categories_id_fk";
  
  DROP INDEX "homepage_side_side_category_idx";
  DROP INDEX "homepage_rail_rail_category_idx";
  DROP INDEX "homepage_sub_leads_sub_leads_category_idx";
  ALTER TABLE "homepage" DROP COLUMN "side_source";
  ALTER TABLE "homepage" DROP COLUMN "side_category_id";
  ALTER TABLE "homepage" DROP COLUMN "side_limit";
  ALTER TABLE "homepage" DROP COLUMN "rail_source";
  ALTER TABLE "homepage" DROP COLUMN "rail_category_id";
  ALTER TABLE "homepage" DROP COLUMN "rail_limit";
  ALTER TABLE "homepage" DROP COLUMN "sub_leads_source";
  ALTER TABLE "homepage" DROP COLUMN "sub_leads_category_id";
  ALTER TABLE "homepage" DROP COLUMN "sub_leads_limit";
  ALTER TABLE "homepage" DROP COLUMN "editors_picks_enabled";
  DROP TYPE "public"."enum_homepage_side_article_types";
  DROP TYPE "public"."enum_homepage_rail_article_types";
  DROP TYPE "public"."enum_homepage_sub_leads_article_types";
  DROP TYPE "public"."enum_homepage_side_source";
  DROP TYPE "public"."enum_homepage_rail_source";
  DROP TYPE "public"."enum_homepage_sub_leads_source";`)
}
