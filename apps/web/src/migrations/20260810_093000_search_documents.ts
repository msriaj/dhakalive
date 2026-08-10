import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

/**
 * The search index.
 *
 * Hand-written, and outside Payload's schema on purpose. A generated `tsvector`
 * column, a GIN index and a trigram index cannot be expressed in a collection
 * config; if this table were a Payload collection, the next `migrate:create`
 * would generate a migration that dropped all three. Payload diffs against its
 * own snapshot, so a table it has never seen is left alone.
 *
 * It is a denormalised projection, not a source of truth. Losing it costs a
 * re-index, nothing more — which is why `down` drops it outright.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE EXTENSION IF NOT EXISTS unaccent;
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
  `)

  /**
   * Refuses to build the index on a database that cannot search Bengali.
   *
   * `pg_trgm` decides what counts as a word character through the database's
   * ctype. Under `C` or `POSIX` it classifies every multibyte character as
   * punctuation, extracts zero trigrams from Bengali text, and the fuzzy
   * fallback then matches nothing — silently, with no error and no empty index
   * to notice. Since that fallback is what compensates for Postgres having no
   * Bengali stemmer, a `C`-ctype database cannot search the majority of this
   * platform's content.
   *
   * Failing the migration is the only place this is cheap to fix: the remedy is
   * to recreate the database with `--locale=C.UTF-8`, which is free before there
   * is data and a dump-and-restore afterwards.
   */
  await db.execute(sql`
    DO $$
    DECLARE ctype text;
    BEGIN
      SELECT datctype INTO ctype FROM pg_database WHERE datname = current_database();
      IF ctype IN ('C', 'POSIX') THEN
        RAISE EXCEPTION
          'Database ctype is "%", which makes pg_trgm blind to Bengali text. '
          'Recreate the database with --locale=C.UTF-8 (or any UTF-8 locale). '
          'See docs/search.md.', ctype;
      END IF;
    END $$;
  `)

  /**
   * `unaccent()` is STABLE, not IMMUTABLE — it reads a dictionary that could in
   * principle be reloaded — so Postgres refuses it in a generated column or an
   * index expression. This wrapper pins the dictionary by name and asserts
   * immutability, which is the documented way around it.
   *
   * The assertion is a promise we have to keep: changing `unaccent.rules`
   * afterwards would silently invalidate every stored vector, and the fix is a
   * full re-index. Nothing in this platform touches those rules.
   */
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION dhakalive_unaccent(text)
      RETURNS text
      LANGUAGE sql
      IMMUTABLE
      STRICT
      PARALLEL SAFE
    AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;
  `)

  /**
   * The text search configuration is chosen per row rather than per column.
   *
   * Postgres ships no Bengali dictionary, so Bengali rows use `simple`: no
   * stemming, no stop words, exact lexemes. English rows use `english` and get
   * proper stemming. One column and one GIN index serve both, because a query
   * always knows its locale and passes the matching configuration.
   *
   * Weights carry the editorial judgement about what a match is worth:
   * headline (A) over summary (B) over section (C) over body (D).
   */
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "search_documents" (
      "id"            serial PRIMARY KEY NOT NULL,
      "collection"    varchar(64) NOT NULL,
      "document_id"   varchar(64) NOT NULL,
      "locale"        varchar(8) NOT NULL,
      "url"           varchar(512) NOT NULL,
      "title"         text NOT NULL,
      "summary"       text,
      "body"          text,
      "section"       varchar(256),
      "section_title" text,
      "tags"          text[] NOT NULL DEFAULT '{}',
      "authors"       text[] NOT NULL DEFAULT '{}',
      "article_type"  varchar(32),
      "image_url"     varchar(512),
      "published_at"  timestamp(3) with time zone,
      "indexed_at"    timestamp(3) with time zone NOT NULL DEFAULT now(),
      "search_vector" tsvector GENERATED ALWAYS AS (
        CASE WHEN "locale" = 'en' THEN
            setweight(to_tsvector('english', dhakalive_unaccent(coalesce("title", ''))), 'A')
         || setweight(to_tsvector('english', dhakalive_unaccent(coalesce("summary", ''))), 'B')
         || setweight(to_tsvector('english', dhakalive_unaccent(coalesce("section_title", ''))), 'C')
         || setweight(to_tsvector('english', dhakalive_unaccent(coalesce("body", ''))), 'D')
        ELSE
            setweight(to_tsvector('simple', dhakalive_unaccent(coalesce("title", ''))), 'A')
         || setweight(to_tsvector('simple', dhakalive_unaccent(coalesce("summary", ''))), 'B')
         || setweight(to_tsvector('simple', dhakalive_unaccent(coalesce("section_title", ''))), 'C')
         || setweight(to_tsvector('simple', dhakalive_unaccent(coalesce("body", ''))), 'D')
        END
      ) STORED,
      CONSTRAINT "search_documents_identity" UNIQUE ("collection", "document_id", "locale")
    );
  `)

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "search_documents_vector_idx"
      ON "search_documents" USING gin ("search_vector");
  `)

  /**
   * Trigram indexes on the two fields a reader actually scans. These back the
   * fuzzy fallback, which is what covers Bengali's missing stemmer: `simple`
   * will not match an inflected form, but its trigrams overlap heavily.
   */
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "search_documents_title_trgm_idx"
      ON "search_documents" USING gin ("title" gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS "search_documents_summary_trgm_idx"
      ON "search_documents" USING gin ("summary" gin_trgm_ops);
  `)

  // Locale is in every query; date is the tiebreaker on equal relevance.
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "search_documents_locale_published_idx"
      ON "search_documents" ("locale", "published_at" DESC NULLS LAST);
    CREATE INDEX IF NOT EXISTS "search_documents_section_idx"
      ON "search_documents" ("section");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "search_documents" CASCADE;`)
  await db.execute(sql`DROP FUNCTION IF EXISTS dhakalive_unaccent(text);`)
  // The extensions are left in place: other things may depend on them, and
  // dropping a shared extension on a rollback is not this migration's call.
}
