import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

/**
 * The homepage's `categorySections` array becomes `sections`, which can now draw
 * a block in any of eleven layouts and fill it from a category, a hand-picked
 * list, recent stories, an article type or a set of sub-collections.
 *
 * Generated as a drop-and-create and edited to a rename.
 *
 * Payload's generator cannot know that the new array is the old one under
 * another name, so it offered to drop `homepage_category_sections` and build
 * `homepage_sections` beside it. That would have thrown away whatever section
 * order and headings an editor had already arranged — data no code path can
 * reconstruct. Renaming the two tables and adding the new columns keeps every
 * existing row: a section that was "this category, four stories" becomes "this
 * category, four stories, drawn as cards", which is what it already looked like.
 *
 * The constraints and indexes are renamed rather than recreated for the same
 * reason Postgres keeps them across `RENAME TO` — they are the same objects, and
 * adding second copies under the new names would leave the table carrying both.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_homepage_sections_article_types" AS ENUM('standard', 'breaking-news', 'opinion', 'editorial', 'feature', 'interview', 'analysis', 'photo-story', 'video-story', 'live-blog');
  CREATE TYPE "public"."enum_homepage_sections_layout" AS ENUM('section-lead', 'story-cards', 'headline-rows', 'headline-list', 'numbered-list', 'mosaic', 'opinion', 'tiny-cards', 'photo-strip', 'video-row', 'collection-columns');
  CREATE TYPE "public"."enum_homepage_sections_source" AS ENUM('category', 'manual', 'latest', 'type', 'collections');
  CREATE TYPE "public"."enum_footer_brand_links_type" AS ENUM('category', 'page', 'custom');
  CREATE TYPE "public"."enum_footer_bottom_links_type" AS ENUM('category', 'page', 'custom');
  ALTER TYPE "public"."enum_advertisements_placement" ADD VALUE 'sidebar' BEFORE 'in-article';

  ALTER TABLE "homepage_category_sections" RENAME TO "homepage_sections";
  ALTER TABLE "homepage_category_sections_locales" RENAME TO "homepage_sections_locales";
  ALTER TABLE "homepage_sections" RENAME CONSTRAINT "homepage_category_sections_category_id_categories_id_fk" TO "homepage_sections_category_id_categories_id_fk";
  ALTER TABLE "homepage_sections" RENAME CONSTRAINT "homepage_category_sections_parent_id_fk" TO "homepage_sections_parent_id_fk";
  ALTER TABLE "homepage_sections_locales" RENAME CONSTRAINT "homepage_category_sections_locales_parent_id_fk" TO "homepage_sections_locales_parent_id_fk";
  ALTER INDEX "homepage_category_sections_order_idx" RENAME TO "homepage_sections_order_idx";
  ALTER INDEX "homepage_category_sections_parent_id_idx" RENAME TO "homepage_sections_parent_id_idx";
  ALTER INDEX "homepage_category_sections_category_idx" RENAME TO "homepage_sections_category_idx";
  ALTER INDEX "homepage_category_sections_locales_locale_parent_id_unique" RENAME TO "homepage_sections_locales_locale_parent_id_unique";

  ALTER TABLE "homepage_sections" ALTER COLUMN "category_id" DROP NOT NULL;
  ALTER TABLE "homepage_sections" ALTER COLUMN "limit" SET DEFAULT 6;
  ALTER TABLE "homepage_sections" ADD COLUMN "layout" "enum_homepage_sections_layout" DEFAULT 'story-cards' NOT NULL;
  ALTER TABLE "homepage_sections" ADD COLUMN "source" "enum_homepage_sections_source" DEFAULT 'category';
  ALTER TABLE "homepage_sections" ADD COLUMN "show_heading" boolean DEFAULT true;
  ALTER TABLE "homepage_sections" ADD COLUMN "show_ad" boolean DEFAULT false;

  CREATE TABLE "homepage_sections_article_types" (
  	"order" integer NOT NULL,
  	"parent_id" varchar NOT NULL,
  	"value" "enum_homepage_sections_article_types",
  	"id" serial PRIMARY KEY NOT NULL
  );

  CREATE TABLE "homepage_sections_columns" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"category_id" integer,
  	"limit" numeric DEFAULT 3
  );

  CREATE TABLE "homepage_sections_columns_locales" (
  	"heading" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );

  CREATE TABLE "footer_brand_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"type" "enum_footer_brand_links_type" DEFAULT 'category' NOT NULL,
  	"category_id" integer,
  	"page_id" integer,
  	"url" varchar
  );

  CREATE TABLE "footer_brand_links_locales" (
  	"label" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );

  CREATE TABLE "footer_bottom_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"type" "enum_footer_bottom_links_type" DEFAULT 'category' NOT NULL,
  	"category_id" integer,
  	"page_id" integer,
  	"url" varchar
  );

  CREATE TABLE "footer_bottom_links_locales" (
  	"label" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );

  ALTER TABLE "homepage" ADD COLUMN "trending_tags_enabled" boolean DEFAULT true;
  ALTER TABLE "homepage_locales" ADD COLUMN "trending_tags_heading" varchar DEFAULT 'আলোচিত বিষয়';
  ALTER TABLE "homepage_rels" ADD COLUMN "tags_id" integer;
  ALTER TABLE "footer" ADD COLUMN "apps_app_store_url" varchar;
  ALTER TABLE "footer" ADD COLUMN "apps_play_store_url" varchar;
  ALTER TABLE "footer_locales" ADD COLUMN "follow_heading" varchar DEFAULT 'অনুসরণ করুন';
  ALTER TABLE "footer_locales" ADD COLUMN "apps_heading" varchar DEFAULT 'মোবাইল অ্যাপস ডাউনলোড করুন';
  ALTER TABLE "footer_locales" ADD COLUMN "imprint" varchar;
  ALTER TABLE "homepage_sections_article_types" ADD CONSTRAINT "homepage_sections_article_types_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."homepage_sections"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "homepage_sections_columns" ADD CONSTRAINT "homepage_sections_columns_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "homepage_sections_columns" ADD CONSTRAINT "homepage_sections_columns_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."homepage_sections"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "homepage_sections_columns_locales" ADD CONSTRAINT "homepage_sections_columns_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."homepage_sections_columns"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "footer_brand_links" ADD CONSTRAINT "footer_brand_links_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "footer_brand_links" ADD CONSTRAINT "footer_brand_links_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "footer_brand_links" ADD CONSTRAINT "footer_brand_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."footer"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "footer_brand_links_locales" ADD CONSTRAINT "footer_brand_links_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."footer_brand_links"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "footer_bottom_links" ADD CONSTRAINT "footer_bottom_links_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "footer_bottom_links" ADD CONSTRAINT "footer_bottom_links_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "footer_bottom_links" ADD CONSTRAINT "footer_bottom_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."footer"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "footer_bottom_links_locales" ADD CONSTRAINT "footer_bottom_links_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."footer_bottom_links"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "homepage_sections_article_types_order_idx" ON "homepage_sections_article_types" USING btree ("order");
  CREATE INDEX "homepage_sections_article_types_parent_idx" ON "homepage_sections_article_types" USING btree ("parent_id");
  CREATE INDEX "homepage_sections_columns_order_idx" ON "homepage_sections_columns" USING btree ("_order");
  CREATE INDEX "homepage_sections_columns_parent_id_idx" ON "homepage_sections_columns" USING btree ("_parent_id");
  CREATE INDEX "homepage_sections_columns_category_idx" ON "homepage_sections_columns" USING btree ("category_id");
  CREATE UNIQUE INDEX "homepage_sections_columns_locales_locale_parent_id_unique" ON "homepage_sections_columns_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "footer_brand_links_order_idx" ON "footer_brand_links" USING btree ("_order");
  CREATE INDEX "footer_brand_links_parent_id_idx" ON "footer_brand_links" USING btree ("_parent_id");
  CREATE INDEX "footer_brand_links_category_idx" ON "footer_brand_links" USING btree ("category_id");
  CREATE INDEX "footer_brand_links_page_idx" ON "footer_brand_links" USING btree ("page_id");
  CREATE UNIQUE INDEX "footer_brand_links_locales_locale_parent_id_unique" ON "footer_brand_links_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "footer_bottom_links_order_idx" ON "footer_bottom_links" USING btree ("_order");
  CREATE INDEX "footer_bottom_links_parent_id_idx" ON "footer_bottom_links" USING btree ("_parent_id");
  CREATE INDEX "footer_bottom_links_category_idx" ON "footer_bottom_links" USING btree ("category_id");
  CREATE INDEX "footer_bottom_links_page_idx" ON "footer_bottom_links" USING btree ("page_id");
  CREATE UNIQUE INDEX "footer_bottom_links_locales_locale_parent_id_unique" ON "footer_bottom_links_locales" USING btree ("_locale","_parent_id");
  ALTER TABLE "homepage_rels" ADD CONSTRAINT "homepage_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "homepage_rels_tags_id_idx" ON "homepage_rels" USING btree ("tags_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "homepage_sections_article_types" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "homepage_sections_columns" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "homepage_sections_columns_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "footer_brand_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "footer_brand_links_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "footer_bottom_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "footer_bottom_links_locales" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "homepage_sections_article_types" CASCADE;
  DROP TABLE "homepage_sections_columns" CASCADE;
  DROP TABLE "homepage_sections_columns_locales" CASCADE;
  DROP TABLE "footer_brand_links" CASCADE;
  DROP TABLE "footer_brand_links_locales" CASCADE;
  DROP TABLE "footer_bottom_links" CASCADE;
  DROP TABLE "footer_bottom_links_locales" CASCADE;
  ALTER TABLE "homepage_rels" DROP CONSTRAINT "homepage_rels_tags_fk";

  ALTER TABLE "advertisements" ALTER COLUMN "placement" SET DATA TYPE text;
  DROP TYPE "public"."enum_advertisements_placement";
  CREATE TYPE "public"."enum_advertisements_placement" AS ENUM('leaderboard', 'in-article', 'footer');
  ALTER TABLE "advertisements" ALTER COLUMN "placement" SET DATA TYPE "public"."enum_advertisements_placement" USING "placement"::"public"."enum_advertisements_placement";
  DROP INDEX "homepage_rels_tags_id_idx";

  /*
   * Back to a category-only section list. Blocks an editor built from a
   * hand-picked list, an article type or the latest stories have no category and
   * cannot be represented by the old shape, so they go rather than being
   * silently rewritten into a section pointing at some arbitrary category.
   */
  DELETE FROM "homepage_sections" WHERE "category_id" IS NULL;
  ALTER TABLE "homepage_sections" DROP COLUMN "layout";
  ALTER TABLE "homepage_sections" DROP COLUMN "source";
  ALTER TABLE "homepage_sections" DROP COLUMN "show_heading";
  ALTER TABLE "homepage_sections" DROP COLUMN "show_ad";
  ALTER TABLE "homepage_sections" ALTER COLUMN "limit" SET DEFAULT 4;
  ALTER TABLE "homepage_sections" ALTER COLUMN "category_id" SET NOT NULL;
  ALTER TABLE "homepage_sections" RENAME CONSTRAINT "homepage_sections_category_id_categories_id_fk" TO "homepage_category_sections_category_id_categories_id_fk";
  ALTER TABLE "homepage_sections" RENAME CONSTRAINT "homepage_sections_parent_id_fk" TO "homepage_category_sections_parent_id_fk";
  ALTER TABLE "homepage_sections_locales" RENAME CONSTRAINT "homepage_sections_locales_parent_id_fk" TO "homepage_category_sections_locales_parent_id_fk";
  ALTER INDEX "homepage_sections_order_idx" RENAME TO "homepage_category_sections_order_idx";
  ALTER INDEX "homepage_sections_parent_id_idx" RENAME TO "homepage_category_sections_parent_id_idx";
  ALTER INDEX "homepage_sections_category_idx" RENAME TO "homepage_category_sections_category_idx";
  ALTER INDEX "homepage_sections_locales_locale_parent_id_unique" RENAME TO "homepage_category_sections_locales_locale_parent_id_unique";
  ALTER TABLE "homepage_sections" RENAME TO "homepage_category_sections";
  ALTER TABLE "homepage_sections_locales" RENAME TO "homepage_category_sections_locales";

  ALTER TABLE "homepage" DROP COLUMN "trending_tags_enabled";
  ALTER TABLE "homepage_locales" DROP COLUMN "trending_tags_heading";
  ALTER TABLE "homepage_rels" DROP COLUMN "tags_id";
  ALTER TABLE "footer" DROP COLUMN "apps_app_store_url";
  ALTER TABLE "footer" DROP COLUMN "apps_play_store_url";
  ALTER TABLE "footer_locales" DROP COLUMN "follow_heading";
  ALTER TABLE "footer_locales" DROP COLUMN "apps_heading";
  ALTER TABLE "footer_locales" DROP COLUMN "imprint";
  DROP TYPE "public"."enum_homepage_sections_article_types";
  DROP TYPE "public"."enum_homepage_sections_layout";
  DROP TYPE "public"."enum_homepage_sections_source";
  DROP TYPE "public"."enum_footer_brand_links_type";
  DROP TYPE "public"."enum_footer_bottom_links_type";`)
}
