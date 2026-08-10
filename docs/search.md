# Search

Search is an interface with adapters behind it. The interface lives in
`packages/search`; the Postgres adapter is the one that ships. Meilisearch and
OpenSearch exist as stubs so that moving to a dedicated engine is a
configuration change and one new file, not a rewrite of the search page and the
indexing jobs.

Nothing in `@dhakalive/search` imports Payload or Next. The Postgres adapter is
handed a SQL executor by the caller — the same pool Payload already owns — so
search can be exercised without standing up a CMS.

## Why Postgres, and what it costs

Postgres ships text search configurations for about twenty languages. Bengali is
not one of them: there is no `bengali` dictionary, no stemmer and no stop-word
list, and there is no maintained extension that supplies one.

The index therefore chooses a configuration per row:

| Locale | Configuration | Consequence                                          |
| ------ | ------------- | ---------------------------------------------------- |
| `en`   | `english`     | Stemming: "debates" matches "debate".                |
| `bn`   | `simple`      | No stemming: "নির্বাচনের" does not match "নির্বাচন". |

`simple` is not a placeholder for something better. A wrong stemmer is worse
than none — English suffix rules applied to Bengali produce lexemes that match
nothing at all.

What closes the gap is a second pass. When full-text search returns no rows, the
adapter runs a trigram-similarity query over the headline and summary using
`pg_trgm`'s `<%` operator. That matches inflected forms, transliterations and
typos in either script. The two paths are reported separately as the result
`strategy`, so the page can tell a reader when it is guessing rather than
presenting approximate hits as exact ones.

`unaccent` normalises Latin diacritics on both sides of the comparison. It does
nothing for Bengali, which is precisely why the trigram pass carries more weight
here than it would on a monolingual English site.

## The database must have a UTF-8 ctype

**This is the one piece of environment configuration search cannot work
around.**

`pg_trgm` decides what counts as a word character through the database's ctype.
Under `C` or `POSIX` it classifies every multibyte character as punctuation,
extracts zero trigrams from Bengali text, and the fuzzy fallback silently
matches nothing — no error, no empty index, nothing to notice.

```sql
-- On a C-ctype database:
SELECT word_similarity('বাজেটের', 'বাজেট অধিবেশন শুরু');  -- 0
-- On a C.UTF-8 database:
SELECT word_similarity('বাজেটের', 'বাজেট অধিবেশন শুরু');  -- 0.625
```

The search migration checks `datctype` and refuses to run when it is `C` or
`POSIX`. Failing there is deliberate: it is the last point at which the fix is
cheap.

Create databases with:

```sql
CREATE DATABASE dhakalive
  TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C.UTF-8';
```

`LC_COLLATE 'C'` keeps sorting at byte order, which is deterministic across
platforms; `LC_CTYPE 'C.UTF-8'` is what gives Unicode character classes.

### Fixing an existing database

`lc_ctype` is fixed when a database is created and cannot be altered. Move the
data instead — no container or volume needs to be recreated:

```bash
docker exec dhakalive-data-postgres-1 pg_dump -U dhakalive -d dhakalive --no-owner --no-acl > dump.sql
docker exec dhakalive-data-postgres-1 psql -U dhakalive -d postgres \
  -c "CREATE DATABASE dhakalive_new TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C.UTF-8';"
docker exec -i dhakalive-data-postgres-1 psql -U dhakalive -d dhakalive_new < dump.sql
docker exec dhakalive-data-postgres-1 psql -U dhakalive -d postgres \
  -c "DROP DATABASE dhakalive;" -c "ALTER DATABASE dhakalive_new RENAME TO dhakalive;"
```

The container is named for the compose project in
`docker/docker-compose.postgres.yml` (`dhakalive-data`), not for the app stack.

If the database has no data worth keeping — a deploy that failed partway
through its first migration, for instance — drop and recreate it instead of
dumping. Check before you do, because this is not reversible:

```bash
docker exec dhakalive-data-postgres-1 psql -U dhakalive -d dhakalive \
  -tAc "select count(*) from users" 2>/dev/null || echo "no users table yet"
docker exec dhakalive-data-postgres-1 psql -U dhakalive -d postgres \
  -c "DROP DATABASE dhakalive;" \
  -c "CREATE DATABASE dhakalive TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C.UTF-8';"
```

For a throwaway development database, `docker compose down -v` followed by
`pnpm --filter @dhakalive/web migrate && pnpm seed` is simpler.

## Schema

`search_documents` is created by a hand-written migration and is invisible to
Payload. That is deliberate. A generated `tsvector` column, a GIN index and two
trigram indexes cannot be expressed in a collection config, so if this table
were a Payload collection the next `migrate:create` would generate a migration
that dropped all three. Payload diffs against its own snapshot, so a table it
has never seen is left alone.

The table is a denormalised projection, not a source of truth: a result card
needs headline, section, byline, image and date, and joining back to five tables
per hit is what makes search slow. Losing the table costs a re-index and nothing
else.

Field weights carry the editorial judgement about what a match is worth:

| Weight | Field         |
| ------ | ------------- |
| A      | headline      |
| B      | summary       |
| C      | section title |
| D      | body          |

### `dhakalive_unaccent`

`unaccent()` is `STABLE`, not `IMMUTABLE` — it reads a dictionary that could in
principle be reloaded — so Postgres refuses it inside a generated column or an
index expression. The migration creates an `IMMUTABLE` wrapper that pins the
dictionary by name, which is the documented way around this.

That assertion is a promise the deployment has to keep: editing
`unaccent.rules` afterwards would silently invalidate every stored vector, and
the fix would be a full re-index.

## Highlighting

`ts_headline` wraps matches in delimiters of our choosing. The obvious choice is
`<b>`/`</b>`, and it is the wrong one: the result would be an HTML string built
partly from the reader's own query, renderable only with
`dangerouslySetInnerHTML`.

The adapter uses two C0 control characters instead, parses them into
`{ text, match }` runs, and lets React render real elements with its own
escaping. Those characters are stripped from all indexed text on the way in, so
a document cannot forge a highlight run.

## Configuration

| Variable          | Meaning                                           |
| ----------------- | ------------------------------------------------- |
| `SEARCH_PROVIDER` | `postgres` (default), `meilisearch`, `opensearch` |
| `SEARCH_URL`      | Required for any provider other than `postgres`   |
| `SEARCH_API_KEY`  | Admin key for the engine, when it needs one       |

Environment validation refuses to start when a non-Postgres provider is selected
without a `SEARCH_URL`. The stub adapters throw by name on first use rather than
no-op, because a provider that quietly indexed nothing would present as "search
returns no results" — indistinguishable from an empty archive.

## Indexing

Indexing is asynchronous and runs on the worker. Every save to an article or a
page queues one `search-index` job carrying the correlation id of the request
that triggered it.

There is no separate de-index task. The document builder returns rows only for
content that is publicly visible, so unpublishing, archiving, deleting or
emptying a required field all produce zero rows — and the handler removes
whatever is in the index. One task, and the visibility rule lives in exactly one
place instead of two that can disagree.

Jobs are keyed by document (`search-index:articles:412`), so five rapid saves
collapse into one job. The job reads the document as it stands when it runs, not
a snapshot from when it was queued, so superseding never loses an edit. The
handler is idempotent in its own right — an upsert and a delete — because a job
can always fail after its side effect and be retried.

Jobs are queued on the request's transaction, so a save that rolls back takes
its indexing job with it.

A full rebuild is available for schema changes and for recovering a lost index:

```bash
pnpm --filter @dhakalive/web reindex
```
