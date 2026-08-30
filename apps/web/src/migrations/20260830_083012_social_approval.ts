import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_articles_social_posts_approval_status" AS ENUM('pending', 'approved', 'declined');
  CREATE TYPE "public"."enum__articles_v_version_social_posts_approval_status" AS ENUM('pending', 'approved', 'declined');
  ALTER TABLE "articles" ADD COLUMN "social_posts_approval_status" "enum_articles_social_posts_approval_status";
  ALTER TABLE "articles" ADD COLUMN "social_posts_approval_requested_at" timestamp(3) with time zone;
  ALTER TABLE "articles" ADD COLUMN "social_posts_approval_message_id" numeric;
  ALTER TABLE "articles" ADD COLUMN "social_posts_approval_decided_by" varchar;
  ALTER TABLE "_articles_v" ADD COLUMN "version_social_posts_approval_status" "enum__articles_v_version_social_posts_approval_status";
  ALTER TABLE "_articles_v" ADD COLUMN "version_social_posts_approval_requested_at" timestamp(3) with time zone;
  ALTER TABLE "_articles_v" ADD COLUMN "version_social_posts_approval_message_id" numeric;
  ALTER TABLE "_articles_v" ADD COLUMN "version_social_posts_approval_decided_by" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "articles" DROP COLUMN "social_posts_approval_status";
  ALTER TABLE "articles" DROP COLUMN "social_posts_approval_requested_at";
  ALTER TABLE "articles" DROP COLUMN "social_posts_approval_message_id";
  ALTER TABLE "articles" DROP COLUMN "social_posts_approval_decided_by";
  ALTER TABLE "_articles_v" DROP COLUMN "version_social_posts_approval_status";
  ALTER TABLE "_articles_v" DROP COLUMN "version_social_posts_approval_requested_at";
  ALTER TABLE "_articles_v" DROP COLUMN "version_social_posts_approval_message_id";
  ALTER TABLE "_articles_v" DROP COLUMN "version_social_posts_approval_decided_by";
  DROP TYPE "public"."enum_articles_social_posts_approval_status";
  DROP TYPE "public"."enum__articles_v_version_social_posts_approval_status";`)
}
