import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_articles_article_type" AS ENUM('standard', 'breaking-news', 'opinion', 'editorial', 'feature', 'interview', 'analysis', 'photo-story', 'video-story', 'live-blog');
  CREATE TYPE "public"."enum_articles_workflow_status" AS ENUM('draft', 'submitted', 'in-review', 'changes-requested', 'approved', 'scheduled', 'published', 'unpublished', 'archived');
  CREATE TYPE "public"."enum_articles_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__articles_v_version_article_type" AS ENUM('standard', 'breaking-news', 'opinion', 'editorial', 'feature', 'interview', 'analysis', 'photo-story', 'video-story', 'live-blog');
  CREATE TYPE "public"."enum__articles_v_version_workflow_status" AS ENUM('draft', 'submitted', 'in-review', 'changes-requested', 'approved', 'scheduled', 'published', 'unpublished', 'archived');
  CREATE TYPE "public"."enum__articles_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__articles_v_published_locale" AS ENUM('bn', 'en');
  CREATE TYPE "public"."enum_media_media_type" AS ENUM('image', 'video', 'audio', 'document');
  CREATE TYPE "public"."enum_media_usage_restrictions" AS ENUM('none', 'editorial-only', 'one-time', 'internal');
  CREATE TYPE "public"."enum_live_blogs_status" AS ENUM('draft', 'live', 'paused', 'ended', 'archived');
  CREATE TABLE "articles_workflow_history" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"from" varchar,
  	"to" varchar,
  	"at" timestamp(3) with time zone,
  	"actor_id" integer,
  	"note" varchar
  );
  
  CREATE TABLE "articles" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"primary_category_id" integer,
  	"featured_image_id" integer,
  	"article_type" "enum_articles_article_type" DEFAULT 'standard',
  	"workflow_status" "enum_articles_workflow_status" DEFAULT 'draft',
  	"workflow_note" varchar,
  	"published_at" timestamp(3) with time zone,
  	"scheduled_at" timestamp(3) with time zone,
  	"is_breaking" boolean DEFAULT false,
  	"breaking_until" timestamp(3) with time zone,
  	"is_featured" boolean DEFAULT false,
  	"translation_of_id" integer,
  	"correction_has_correction" boolean DEFAULT false,
  	"correction_corrected_at" timestamp(3) with time zone,
  	"created_by_id" integer,
  	"last_edited_by_id" integer,
  	"seo_image_id" integer,
  	"seo_canonical_url" varchar,
  	"seo_no_index" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_articles_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "articles_locales" (
  	"headline" varchar,
  	"subheadline" varchar,
  	"slug" varchar,
  	"summary" varchar,
  	"body" jsonb,
  	"correction_note" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "articles_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"authors_id" integer,
  	"categories_id" integer,
  	"tags_id" integer
  );
  
  CREATE TABLE "_articles_v_version_workflow_history" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"from" varchar,
  	"to" varchar,
  	"at" timestamp(3) with time zone,
  	"actor_id" integer,
  	"note" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_articles_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_primary_category_id" integer,
  	"version_featured_image_id" integer,
  	"version_article_type" "enum__articles_v_version_article_type" DEFAULT 'standard',
  	"version_workflow_status" "enum__articles_v_version_workflow_status" DEFAULT 'draft',
  	"version_workflow_note" varchar,
  	"version_published_at" timestamp(3) with time zone,
  	"version_scheduled_at" timestamp(3) with time zone,
  	"version_is_breaking" boolean DEFAULT false,
  	"version_breaking_until" timestamp(3) with time zone,
  	"version_is_featured" boolean DEFAULT false,
  	"version_translation_of_id" integer,
  	"version_correction_has_correction" boolean DEFAULT false,
  	"version_correction_corrected_at" timestamp(3) with time zone,
  	"version_created_by_id" integer,
  	"version_last_edited_by_id" integer,
  	"version_seo_image_id" integer,
  	"version_seo_canonical_url" varchar,
  	"version_seo_no_index" boolean DEFAULT false,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__articles_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__articles_v_published_locale",
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "_articles_v_locales" (
  	"version_headline" varchar,
  	"version_subheadline" varchar,
  	"version_slug" varchar,
  	"version_summary" varchar,
  	"version_body" jsonb,
  	"version_correction_note" varchar,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_articles_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"authors_id" integer,
  	"categories_id" integer,
  	"tags_id" integer
  );
  
  CREATE TABLE "categories" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"image_id" integer,
  	"display_order" numeric DEFAULT 0,
  	"is_active" boolean DEFAULT true,
  	"seo_image_id" integer,
  	"seo_canonical_url" varchar,
  	"seo_no_index" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "categories_locales" (
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "tags" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"seo_image_id" integer,
  	"seo_canonical_url" varchar,
  	"seo_no_index" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "tags_locales" (
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "authors" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar NOT NULL,
  	"user_id" integer,
  	"avatar_id" integer,
  	"contact_email" varchar,
  	"contact_website" varchar,
  	"contact_x" varchar,
  	"contact_facebook" varchar,
  	"contact_linkedin" varchar,
  	"is_active" boolean DEFAULT true,
  	"seo_image_id" integer,
  	"seo_canonical_url" varchar,
  	"seo_no_index" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "authors_locales" (
  	"display_name" varchar NOT NULL,
  	"designation" varchar,
  	"biography" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"credit" varchar,
  	"copyright" varchar,
  	"source" varchar,
  	"media_type" "enum_media_media_type" DEFAULT 'image',
  	"usage_restrictions" "enum_media_usage_restrictions" DEFAULT 'none',
  	"uploaded_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric,
  	"sizes_thumbnail_url" varchar,
  	"sizes_thumbnail_width" numeric,
  	"sizes_thumbnail_height" numeric,
  	"sizes_thumbnail_mime_type" varchar,
  	"sizes_thumbnail_filesize" numeric,
  	"sizes_thumbnail_filename" varchar,
  	"sizes_card_url" varchar,
  	"sizes_card_width" numeric,
  	"sizes_card_height" numeric,
  	"sizes_card_mime_type" varchar,
  	"sizes_card_filesize" numeric,
  	"sizes_card_filename" varchar,
  	"sizes_feature_url" varchar,
  	"sizes_feature_width" numeric,
  	"sizes_feature_height" numeric,
  	"sizes_feature_mime_type" varchar,
  	"sizes_feature_filesize" numeric,
  	"sizes_feature_filename" varchar,
  	"sizes_wide_url" varchar,
  	"sizes_wide_width" numeric,
  	"sizes_wide_height" numeric,
  	"sizes_wide_mime_type" varchar,
  	"sizes_wide_filesize" numeric,
  	"sizes_wide_filename" varchar,
  	"sizes_og_url" varchar,
  	"sizes_og_width" numeric,
  	"sizes_og_height" numeric,
  	"sizes_og_mime_type" varchar,
  	"sizes_og_filesize" numeric,
  	"sizes_og_filename" varchar
  );
  
  CREATE TABLE "media_locales" (
  	"alt" varchar,
  	"caption" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "live_blogs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"status" "enum_live_blogs_status" DEFAULT 'draft' NOT NULL,
  	"related_article_id" integer,
  	"started_at" timestamp(3) with time zone,
  	"ended_at" timestamp(3) with time zone,
  	"created_by_id" integer,
  	"seo_image_id" integer,
  	"seo_canonical_url" varchar,
  	"seo_no_index" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "live_blogs_locales" (
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"summary" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "live_blogs_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"authors_id" integer
  );
  
  CREATE TABLE "live_blog_updates" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"live_blog_id" integer NOT NULL,
  	"published_at" timestamp(3) with time zone NOT NULL,
  	"media_id" integer,
  	"author_id" integer,
  	"is_pinned" boolean DEFAULT false,
  	"is_correction" boolean DEFAULT false,
  	"created_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "live_blog_updates_locales" (
  	"headline" varchar,
  	"content" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "articles_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "categories_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "tags_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "authors_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "media_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "live_blogs_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "live_blog_updates_id" integer;
  ALTER TABLE "articles_workflow_history" ADD CONSTRAINT "articles_workflow_history_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles_workflow_history" ADD CONSTRAINT "articles_workflow_history_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles" ADD CONSTRAINT "articles_primary_category_id_categories_id_fk" FOREIGN KEY ("primary_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles" ADD CONSTRAINT "articles_featured_image_id_media_id_fk" FOREIGN KEY ("featured_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles" ADD CONSTRAINT "articles_translation_of_id_articles_id_fk" FOREIGN KEY ("translation_of_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles" ADD CONSTRAINT "articles_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles" ADD CONSTRAINT "articles_last_edited_by_id_users_id_fk" FOREIGN KEY ("last_edited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles" ADD CONSTRAINT "articles_seo_image_id_media_id_fk" FOREIGN KEY ("seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "articles_locales" ADD CONSTRAINT "articles_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_rels" ADD CONSTRAINT "articles_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_rels" ADD CONSTRAINT "articles_rels_authors_fk" FOREIGN KEY ("authors_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_rels" ADD CONSTRAINT "articles_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "articles_rels" ADD CONSTRAINT "articles_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_version_workflow_history" ADD CONSTRAINT "_articles_v_version_workflow_history_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v_version_workflow_history" ADD CONSTRAINT "_articles_v_version_workflow_history_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_parent_id_articles_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_version_primary_category_id_categories_id_fk" FOREIGN KEY ("version_primary_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_version_featured_image_id_media_id_fk" FOREIGN KEY ("version_featured_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_version_translation_of_id_articles_id_fk" FOREIGN KEY ("version_translation_of_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_version_created_by_id_users_id_fk" FOREIGN KEY ("version_created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_version_last_edited_by_id_users_id_fk" FOREIGN KEY ("version_last_edited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v" ADD CONSTRAINT "_articles_v_version_seo_image_id_media_id_fk" FOREIGN KEY ("version_seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_articles_v_locales" ADD CONSTRAINT "_articles_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_rels" ADD CONSTRAINT "_articles_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_articles_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_rels" ADD CONSTRAINT "_articles_v_rels_authors_fk" FOREIGN KEY ("authors_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_rels" ADD CONSTRAINT "_articles_v_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_articles_v_rels" ADD CONSTRAINT "_articles_v_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "categories" ADD CONSTRAINT "categories_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "categories" ADD CONSTRAINT "categories_seo_image_id_media_id_fk" FOREIGN KEY ("seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "categories_locales" ADD CONSTRAINT "categories_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tags" ADD CONSTRAINT "tags_seo_image_id_media_id_fk" FOREIGN KEY ("seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tags_locales" ADD CONSTRAINT "tags_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "authors" ADD CONSTRAINT "authors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "authors" ADD CONSTRAINT "authors_avatar_id_media_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "authors" ADD CONSTRAINT "authors_seo_image_id_media_id_fk" FOREIGN KEY ("seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "authors_locales" ADD CONSTRAINT "authors_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media_locales" ADD CONSTRAINT "media_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "live_blogs" ADD CONSTRAINT "live_blogs_related_article_id_articles_id_fk" FOREIGN KEY ("related_article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "live_blogs" ADD CONSTRAINT "live_blogs_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "live_blogs" ADD CONSTRAINT "live_blogs_seo_image_id_media_id_fk" FOREIGN KEY ("seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "live_blogs_locales" ADD CONSTRAINT "live_blogs_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."live_blogs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "live_blogs_rels" ADD CONSTRAINT "live_blogs_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."live_blogs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "live_blogs_rels" ADD CONSTRAINT "live_blogs_rels_authors_fk" FOREIGN KEY ("authors_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "live_blog_updates" ADD CONSTRAINT "live_blog_updates_live_blog_id_live_blogs_id_fk" FOREIGN KEY ("live_blog_id") REFERENCES "public"."live_blogs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "live_blog_updates" ADD CONSTRAINT "live_blog_updates_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "live_blog_updates" ADD CONSTRAINT "live_blog_updates_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "live_blog_updates" ADD CONSTRAINT "live_blog_updates_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "live_blog_updates_locales" ADD CONSTRAINT "live_blog_updates_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."live_blog_updates"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "articles_workflow_history_order_idx" ON "articles_workflow_history" USING btree ("_order");
  CREATE INDEX "articles_workflow_history_parent_id_idx" ON "articles_workflow_history" USING btree ("_parent_id");
  CREATE INDEX "articles_workflow_history_actor_idx" ON "articles_workflow_history" USING btree ("actor_id");
  CREATE INDEX "articles_primary_category_idx" ON "articles" USING btree ("primary_category_id");
  CREATE INDEX "articles_featured_image_idx" ON "articles" USING btree ("featured_image_id");
  CREATE INDEX "articles_article_type_idx" ON "articles" USING btree ("article_type");
  CREATE INDEX "articles_workflow_status_idx" ON "articles" USING btree ("workflow_status");
  CREATE INDEX "articles_published_at_idx" ON "articles" USING btree ("published_at");
  CREATE INDEX "articles_scheduled_at_idx" ON "articles" USING btree ("scheduled_at");
  CREATE INDEX "articles_is_breaking_idx" ON "articles" USING btree ("is_breaking");
  CREATE INDEX "articles_is_featured_idx" ON "articles" USING btree ("is_featured");
  CREATE INDEX "articles_translation_of_idx" ON "articles" USING btree ("translation_of_id");
  CREATE INDEX "articles_created_by_idx" ON "articles" USING btree ("created_by_id");
  CREATE INDEX "articles_last_edited_by_idx" ON "articles" USING btree ("last_edited_by_id");
  CREATE INDEX "articles_seo_seo_image_idx" ON "articles" USING btree ("seo_image_id");
  CREATE INDEX "articles_updated_at_idx" ON "articles" USING btree ("updated_at");
  CREATE INDEX "articles_created_at_idx" ON "articles" USING btree ("created_at");
  CREATE INDEX "articles__status_idx" ON "articles" USING btree ("_status");
  CREATE INDEX "articles_headline_idx" ON "articles_locales" USING btree ("headline","_locale");
  CREATE UNIQUE INDEX "articles_slug_idx" ON "articles_locales" USING btree ("slug","_locale");
  CREATE UNIQUE INDEX "articles_locales_locale_parent_id_unique" ON "articles_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "articles_rels_order_idx" ON "articles_rels" USING btree ("order");
  CREATE INDEX "articles_rels_parent_idx" ON "articles_rels" USING btree ("parent_id");
  CREATE INDEX "articles_rels_path_idx" ON "articles_rels" USING btree ("path");
  CREATE INDEX "articles_rels_authors_id_idx" ON "articles_rels" USING btree ("authors_id");
  CREATE INDEX "articles_rels_categories_id_idx" ON "articles_rels" USING btree ("categories_id");
  CREATE INDEX "articles_rels_tags_id_idx" ON "articles_rels" USING btree ("tags_id");
  CREATE INDEX "_articles_v_version_workflow_history_order_idx" ON "_articles_v_version_workflow_history" USING btree ("_order");
  CREATE INDEX "_articles_v_version_workflow_history_parent_id_idx" ON "_articles_v_version_workflow_history" USING btree ("_parent_id");
  CREATE INDEX "_articles_v_version_workflow_history_actor_idx" ON "_articles_v_version_workflow_history" USING btree ("actor_id");
  CREATE INDEX "_articles_v_parent_idx" ON "_articles_v" USING btree ("parent_id");
  CREATE INDEX "_articles_v_version_version_primary_category_idx" ON "_articles_v" USING btree ("version_primary_category_id");
  CREATE INDEX "_articles_v_version_version_featured_image_idx" ON "_articles_v" USING btree ("version_featured_image_id");
  CREATE INDEX "_articles_v_version_version_article_type_idx" ON "_articles_v" USING btree ("version_article_type");
  CREATE INDEX "_articles_v_version_version_workflow_status_idx" ON "_articles_v" USING btree ("version_workflow_status");
  CREATE INDEX "_articles_v_version_version_published_at_idx" ON "_articles_v" USING btree ("version_published_at");
  CREATE INDEX "_articles_v_version_version_scheduled_at_idx" ON "_articles_v" USING btree ("version_scheduled_at");
  CREATE INDEX "_articles_v_version_version_is_breaking_idx" ON "_articles_v" USING btree ("version_is_breaking");
  CREATE INDEX "_articles_v_version_version_is_featured_idx" ON "_articles_v" USING btree ("version_is_featured");
  CREATE INDEX "_articles_v_version_version_translation_of_idx" ON "_articles_v" USING btree ("version_translation_of_id");
  CREATE INDEX "_articles_v_version_version_created_by_idx" ON "_articles_v" USING btree ("version_created_by_id");
  CREATE INDEX "_articles_v_version_version_last_edited_by_idx" ON "_articles_v" USING btree ("version_last_edited_by_id");
  CREATE INDEX "_articles_v_version_seo_version_seo_image_idx" ON "_articles_v" USING btree ("version_seo_image_id");
  CREATE INDEX "_articles_v_version_version_updated_at_idx" ON "_articles_v" USING btree ("version_updated_at");
  CREATE INDEX "_articles_v_version_version_created_at_idx" ON "_articles_v" USING btree ("version_created_at");
  CREATE INDEX "_articles_v_version_version__status_idx" ON "_articles_v" USING btree ("version__status");
  CREATE INDEX "_articles_v_created_at_idx" ON "_articles_v" USING btree ("created_at");
  CREATE INDEX "_articles_v_updated_at_idx" ON "_articles_v" USING btree ("updated_at");
  CREATE INDEX "_articles_v_snapshot_idx" ON "_articles_v" USING btree ("snapshot");
  CREATE INDEX "_articles_v_published_locale_idx" ON "_articles_v" USING btree ("published_locale");
  CREATE INDEX "_articles_v_latest_idx" ON "_articles_v" USING btree ("latest");
  CREATE INDEX "_articles_v_autosave_idx" ON "_articles_v" USING btree ("autosave");
  CREATE INDEX "_articles_v_version_version_headline_idx" ON "_articles_v_locales" USING btree ("version_headline","_locale");
  CREATE INDEX "_articles_v_version_version_slug_idx" ON "_articles_v_locales" USING btree ("version_slug","_locale");
  CREATE UNIQUE INDEX "_articles_v_locales_locale_parent_id_unique" ON "_articles_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_articles_v_rels_order_idx" ON "_articles_v_rels" USING btree ("order");
  CREATE INDEX "_articles_v_rels_parent_idx" ON "_articles_v_rels" USING btree ("parent_id");
  CREATE INDEX "_articles_v_rels_path_idx" ON "_articles_v_rels" USING btree ("path");
  CREATE INDEX "_articles_v_rels_authors_id_idx" ON "_articles_v_rels" USING btree ("authors_id");
  CREATE INDEX "_articles_v_rels_categories_id_idx" ON "_articles_v_rels" USING btree ("categories_id");
  CREATE INDEX "_articles_v_rels_tags_id_idx" ON "_articles_v_rels" USING btree ("tags_id");
  CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("parent_id");
  CREATE INDEX "categories_image_idx" ON "categories" USING btree ("image_id");
  CREATE INDEX "categories_display_order_idx" ON "categories" USING btree ("display_order");
  CREATE INDEX "categories_is_active_idx" ON "categories" USING btree ("is_active");
  CREATE INDEX "categories_seo_seo_image_idx" ON "categories" USING btree ("seo_image_id");
  CREATE INDEX "categories_updated_at_idx" ON "categories" USING btree ("updated_at");
  CREATE INDEX "categories_created_at_idx" ON "categories" USING btree ("created_at");
  CREATE UNIQUE INDEX "categories_slug_idx" ON "categories_locales" USING btree ("slug","_locale");
  CREATE UNIQUE INDEX "categories_locales_locale_parent_id_unique" ON "categories_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "tags_seo_seo_image_idx" ON "tags" USING btree ("seo_image_id");
  CREATE INDEX "tags_updated_at_idx" ON "tags" USING btree ("updated_at");
  CREATE INDEX "tags_created_at_idx" ON "tags" USING btree ("created_at");
  CREATE UNIQUE INDEX "tags_slug_idx" ON "tags_locales" USING btree ("slug","_locale");
  CREATE UNIQUE INDEX "tags_locales_locale_parent_id_unique" ON "tags_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "authors_slug_idx" ON "authors" USING btree ("slug");
  CREATE UNIQUE INDEX "authors_user_idx" ON "authors" USING btree ("user_id");
  CREATE INDEX "authors_avatar_idx" ON "authors" USING btree ("avatar_id");
  CREATE INDEX "authors_is_active_idx" ON "authors" USING btree ("is_active");
  CREATE INDEX "authors_seo_seo_image_idx" ON "authors" USING btree ("seo_image_id");
  CREATE INDEX "authors_updated_at_idx" ON "authors" USING btree ("updated_at");
  CREATE INDEX "authors_created_at_idx" ON "authors" USING btree ("created_at");
  CREATE UNIQUE INDEX "authors_locales_locale_parent_id_unique" ON "authors_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "media_media_type_idx" ON "media" USING btree ("media_type");
  CREATE INDEX "media_uploaded_by_idx" ON "media" USING btree ("uploaded_by_id");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE INDEX "media_sizes_thumbnail_sizes_thumbnail_filename_idx" ON "media" USING btree ("sizes_thumbnail_filename");
  CREATE INDEX "media_sizes_card_sizes_card_filename_idx" ON "media" USING btree ("sizes_card_filename");
  CREATE INDEX "media_sizes_feature_sizes_feature_filename_idx" ON "media" USING btree ("sizes_feature_filename");
  CREATE INDEX "media_sizes_wide_sizes_wide_filename_idx" ON "media" USING btree ("sizes_wide_filename");
  CREATE INDEX "media_sizes_og_sizes_og_filename_idx" ON "media" USING btree ("sizes_og_filename");
  CREATE UNIQUE INDEX "media_locales_locale_parent_id_unique" ON "media_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "live_blogs_status_idx" ON "live_blogs" USING btree ("status");
  CREATE INDEX "live_blogs_related_article_idx" ON "live_blogs" USING btree ("related_article_id");
  CREATE INDEX "live_blogs_started_at_idx" ON "live_blogs" USING btree ("started_at");
  CREATE INDEX "live_blogs_created_by_idx" ON "live_blogs" USING btree ("created_by_id");
  CREATE INDEX "live_blogs_seo_seo_image_idx" ON "live_blogs" USING btree ("seo_image_id");
  CREATE INDEX "live_blogs_updated_at_idx" ON "live_blogs" USING btree ("updated_at");
  CREATE INDEX "live_blogs_created_at_idx" ON "live_blogs" USING btree ("created_at");
  CREATE UNIQUE INDEX "live_blogs_slug_idx" ON "live_blogs_locales" USING btree ("slug","_locale");
  CREATE UNIQUE INDEX "live_blogs_locales_locale_parent_id_unique" ON "live_blogs_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "live_blogs_rels_order_idx" ON "live_blogs_rels" USING btree ("order");
  CREATE INDEX "live_blogs_rels_parent_idx" ON "live_blogs_rels" USING btree ("parent_id");
  CREATE INDEX "live_blogs_rels_path_idx" ON "live_blogs_rels" USING btree ("path");
  CREATE INDEX "live_blogs_rels_authors_id_idx" ON "live_blogs_rels" USING btree ("authors_id");
  CREATE INDEX "live_blog_updates_live_blog_idx" ON "live_blog_updates" USING btree ("live_blog_id");
  CREATE INDEX "live_blog_updates_published_at_idx" ON "live_blog_updates" USING btree ("published_at");
  CREATE INDEX "live_blog_updates_media_idx" ON "live_blog_updates" USING btree ("media_id");
  CREATE INDEX "live_blog_updates_author_idx" ON "live_blog_updates" USING btree ("author_id");
  CREATE INDEX "live_blog_updates_is_pinned_idx" ON "live_blog_updates" USING btree ("is_pinned");
  CREATE INDEX "live_blog_updates_created_by_idx" ON "live_blog_updates" USING btree ("created_by_id");
  CREATE INDEX "live_blog_updates_updated_at_idx" ON "live_blog_updates" USING btree ("updated_at");
  CREATE INDEX "live_blog_updates_created_at_idx" ON "live_blog_updates" USING btree ("created_at");
  CREATE UNIQUE INDEX "live_blog_updates_locales_locale_parent_id_unique" ON "live_blog_updates_locales" USING btree ("_locale","_parent_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_articles_fk" FOREIGN KEY ("articles_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_authors_fk" FOREIGN KEY ("authors_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_live_blogs_fk" FOREIGN KEY ("live_blogs_id") REFERENCES "public"."live_blogs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_live_blog_updates_fk" FOREIGN KEY ("live_blog_updates_id") REFERENCES "public"."live_blog_updates"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_articles_id_idx" ON "payload_locked_documents_rels" USING btree ("articles_id");
  CREATE INDEX "payload_locked_documents_rels_categories_id_idx" ON "payload_locked_documents_rels" USING btree ("categories_id");
  CREATE INDEX "payload_locked_documents_rels_tags_id_idx" ON "payload_locked_documents_rels" USING btree ("tags_id");
  CREATE INDEX "payload_locked_documents_rels_authors_id_idx" ON "payload_locked_documents_rels" USING btree ("authors_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_live_blogs_id_idx" ON "payload_locked_documents_rels" USING btree ("live_blogs_id");
  CREATE INDEX "payload_locked_documents_rels_live_blog_updates_id_idx" ON "payload_locked_documents_rels" USING btree ("live_blog_updates_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "articles_workflow_history" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "articles" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "articles_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "articles_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_articles_v_version_workflow_history" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_articles_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_articles_v_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_articles_v_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "categories" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "categories_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "tags" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "tags_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "authors" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "authors_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "media" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "media_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "live_blogs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "live_blogs_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "live_blogs_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "live_blog_updates" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "live_blog_updates_locales" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "articles_workflow_history" CASCADE;
  DROP TABLE "articles" CASCADE;
  DROP TABLE "articles_locales" CASCADE;
  DROP TABLE "articles_rels" CASCADE;
  DROP TABLE "_articles_v_version_workflow_history" CASCADE;
  DROP TABLE "_articles_v" CASCADE;
  DROP TABLE "_articles_v_locales" CASCADE;
  DROP TABLE "_articles_v_rels" CASCADE;
  DROP TABLE "categories" CASCADE;
  DROP TABLE "categories_locales" CASCADE;
  DROP TABLE "tags" CASCADE;
  DROP TABLE "tags_locales" CASCADE;
  DROP TABLE "authors" CASCADE;
  DROP TABLE "authors_locales" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "media_locales" CASCADE;
  DROP TABLE "live_blogs" CASCADE;
  DROP TABLE "live_blogs_locales" CASCADE;
  DROP TABLE "live_blogs_rels" CASCADE;
  DROP TABLE "live_blog_updates" CASCADE;
  DROP TABLE "live_blog_updates_locales" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_articles_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_categories_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_tags_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_authors_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_media_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_live_blogs_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_live_blog_updates_fk";
  
  DROP INDEX "payload_locked_documents_rels_articles_id_idx";
  DROP INDEX "payload_locked_documents_rels_categories_id_idx";
  DROP INDEX "payload_locked_documents_rels_tags_id_idx";
  DROP INDEX "payload_locked_documents_rels_authors_id_idx";
  DROP INDEX "payload_locked_documents_rels_media_id_idx";
  DROP INDEX "payload_locked_documents_rels_live_blogs_id_idx";
  DROP INDEX "payload_locked_documents_rels_live_blog_updates_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "articles_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "categories_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "tags_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "authors_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "media_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "live_blogs_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "live_blog_updates_id";
  DROP TYPE "public"."enum_articles_article_type";
  DROP TYPE "public"."enum_articles_workflow_status";
  DROP TYPE "public"."enum_articles_status";
  DROP TYPE "public"."enum__articles_v_version_article_type";
  DROP TYPE "public"."enum__articles_v_version_workflow_status";
  DROP TYPE "public"."enum__articles_v_version_status";
  DROP TYPE "public"."enum__articles_v_published_locale";
  DROP TYPE "public"."enum_media_media_type";
  DROP TYPE "public"."enum_media_usage_restrictions";
  DROP TYPE "public"."enum_live_blogs_status";`)
}
