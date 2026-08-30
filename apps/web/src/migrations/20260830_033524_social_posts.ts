import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'social-photocard' BEFORE 'prune-jobs';
  ALTER TYPE "public"."enum_payload_jobs_log_parent_task_slug" ADD VALUE 'social-photocard' BEFORE 'prune-jobs';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'social-photocard' BEFORE 'prune-jobs';
  ALTER TABLE "articles" ADD COLUMN "social_posts_facebook_posted_at" timestamp(3) with time zone;
  ALTER TABLE "articles" ADD COLUMN "social_posts_facebook_post_url" varchar;
  ALTER TABLE "_articles_v" ADD COLUMN "version_social_posts_facebook_posted_at" timestamp(3) with time zone;
  ALTER TABLE "_articles_v" ADD COLUMN "version_social_posts_facebook_post_url" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'publish-scheduled', 'expire-breaking', 'revalidate', 'search-index', 'prune-jobs');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "parent_task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_parent_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_parent_task_slug" AS ENUM('inline', 'publish-scheduled', 'expire-breaking', 'revalidate', 'search-index', 'prune-jobs');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "parent_task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_parent_task_slug" USING "parent_task_slug"::"public"."enum_payload_jobs_log_parent_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'publish-scheduled', 'expire-breaking', 'revalidate', 'search-index', 'prune-jobs');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  ALTER TABLE "articles" DROP COLUMN "social_posts_facebook_posted_at";
  ALTER TABLE "articles" DROP COLUMN "social_posts_facebook_post_url";
  ALTER TABLE "_articles_v" DROP COLUMN "version_social_posts_facebook_posted_at";
  ALTER TABLE "_articles_v" DROP COLUMN "version_social_posts_facebook_post_url";`)
}
