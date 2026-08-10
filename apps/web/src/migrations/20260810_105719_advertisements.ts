import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_advertisements_languages" AS ENUM('bn', 'en');
  CREATE TYPE "public"."enum_advertisements_placement" AS ENUM('leaderboard', 'in-article', 'footer');
  CREATE TABLE "advertisements_languages" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_advertisements_languages",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "advertisements" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"advertiser" varchar NOT NULL,
  	"placement" "enum_advertisements_placement" NOT NULL,
  	"image_id" integer NOT NULL,
  	"destination_url" varchar NOT NULL,
  	"starts_at" timestamp(3) with time zone,
  	"ends_at" timestamp(3) with time zone,
  	"is_active" boolean DEFAULT true,
  	"weight" numeric DEFAULT 1,
  	"created_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "advertisements_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"categories_id" integer
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "advertisements_id" integer;
  ALTER TABLE "advertisements_languages" ADD CONSTRAINT "advertisements_languages_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."advertisements"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "advertisements" ADD CONSTRAINT "advertisements_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "advertisements" ADD CONSTRAINT "advertisements_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "advertisements_rels" ADD CONSTRAINT "advertisements_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."advertisements"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "advertisements_rels" ADD CONSTRAINT "advertisements_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "advertisements_languages_order_idx" ON "advertisements_languages" USING btree ("order");
  CREATE INDEX "advertisements_languages_parent_idx" ON "advertisements_languages" USING btree ("parent_id");
  CREATE INDEX "advertisements_placement_idx" ON "advertisements" USING btree ("placement");
  CREATE INDEX "advertisements_image_idx" ON "advertisements" USING btree ("image_id");
  CREATE INDEX "advertisements_starts_at_idx" ON "advertisements" USING btree ("starts_at");
  CREATE INDEX "advertisements_ends_at_idx" ON "advertisements" USING btree ("ends_at");
  CREATE INDEX "advertisements_is_active_idx" ON "advertisements" USING btree ("is_active");
  CREATE INDEX "advertisements_created_by_idx" ON "advertisements" USING btree ("created_by_id");
  CREATE INDEX "advertisements_updated_at_idx" ON "advertisements" USING btree ("updated_at");
  CREATE INDEX "advertisements_created_at_idx" ON "advertisements" USING btree ("created_at");
  CREATE INDEX "advertisements_rels_order_idx" ON "advertisements_rels" USING btree ("order");
  CREATE INDEX "advertisements_rels_parent_idx" ON "advertisements_rels" USING btree ("parent_id");
  CREATE INDEX "advertisements_rels_path_idx" ON "advertisements_rels" USING btree ("path");
  CREATE INDEX "advertisements_rels_categories_id_idx" ON "advertisements_rels" USING btree ("categories_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_advertisements_fk" FOREIGN KEY ("advertisements_id") REFERENCES "public"."advertisements"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_advertisements_id_idx" ON "payload_locked_documents_rels" USING btree ("advertisements_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "advertisements_languages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "advertisements" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "advertisements_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "advertisements_languages" CASCADE;
  DROP TABLE "advertisements" CASCADE;
  DROP TABLE "advertisements_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_advertisements_fk";
  
  DROP INDEX "payload_locked_documents_rels_advertisements_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "advertisements_id";
  DROP TYPE "public"."enum_advertisements_languages";
  DROP TYPE "public"."enum_advertisements_placement";`)
}
