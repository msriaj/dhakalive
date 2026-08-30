import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "articles" ADD COLUMN "social_posts_linkedin_posted_at" timestamp(3) with time zone;
  ALTER TABLE "articles" ADD COLUMN "social_posts_linkedin_post_url" varchar;
  ALTER TABLE "articles" ADD COLUMN "social_posts_x_posted_at" timestamp(3) with time zone;
  ALTER TABLE "articles" ADD COLUMN "social_posts_x_post_url" varchar;
  ALTER TABLE "_articles_v" ADD COLUMN "version_social_posts_linkedin_posted_at" timestamp(3) with time zone;
  ALTER TABLE "_articles_v" ADD COLUMN "version_social_posts_linkedin_post_url" varchar;
  ALTER TABLE "_articles_v" ADD COLUMN "version_social_posts_x_posted_at" timestamp(3) with time zone;
  ALTER TABLE "_articles_v" ADD COLUMN "version_social_posts_x_post_url" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "articles" DROP COLUMN "social_posts_linkedin_posted_at";
  ALTER TABLE "articles" DROP COLUMN "social_posts_linkedin_post_url";
  ALTER TABLE "articles" DROP COLUMN "social_posts_x_posted_at";
  ALTER TABLE "articles" DROP COLUMN "social_posts_x_post_url";
  ALTER TABLE "_articles_v" DROP COLUMN "version_social_posts_linkedin_posted_at";
  ALTER TABLE "_articles_v" DROP COLUMN "version_social_posts_linkedin_post_url";
  ALTER TABLE "_articles_v" DROP COLUMN "version_social_posts_x_posted_at";
  ALTER TABLE "_articles_v" DROP COLUMN "version_social_posts_x_post_url";`)
}
