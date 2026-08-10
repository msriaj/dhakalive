# Local setup

## 1. Toolchain

Node 20.9+ (24.x recommended) and pnpm 11 via corepack:

```bash
corepack enable && corepack prepare pnpm@11.17.0 --activate
```

Docker Desktop (or any Docker daemon) must be running before the database step.

## 2. Install

```bash
pnpm install
```

This installs all six workspace projects. `pnpm` is pinned via `packageManager`,
so a different pnpm major will refuse rather than silently produce a different
dependency tree.

## 3. Environment

```bash
cp .env.example .env
```

The file lives at the **repository root**, not inside `apps/web`. One file serves
the web app, the Payload CLI, the worker and docker-compose:

- `next.config.ts` loads it before Next compiles, so `NEXT_PUBLIC_*` values are
  inlined correctly.
- The Payload CLI and worker scripts pass `--env-file-if-exists=../../.env`.
- Real container and CI environments already have variables set, and
  `loadEnvFile` never overrides an existing variable.

Fill in the two secrets:

```bash
openssl rand -base64 48
```

```bash
openssl rand -hex 32
```

Paste the first into `PAYLOAD_SECRET` (minimum 32 characters — it signs auth
cookies and password-reset tokens) and the second into `REVALIDATION_SECRET`.

Validation runs at boot and fails fast, listing every offending key at once.
Values are never echoed into the error. Full reference:
[environment.md](environment.md).

## 4. Database and Redis

```bash
docker compose up -d postgres redis
```

Both have health checks; `docker compose ps` shows when they are ready. Postgres
is initialised with `--encoding=UTF8 --locale=C`, which is required for Bengali
content and keeps index ordering deterministic across platforms.

Apply the schema:

```bash
pnpm --filter @dhakalive/web migrate
```

> `DATABASE_PUSH=true` in `.env` lets Payload sync schema directly during local
> iteration. It is refused when `APP_ENV=production` — production schema changes
> go through committed migrations only.

### Creating a migration

```bash
pnpm --filter @dhakalive/web migrate:create <name>
```

This runs `payload migrate:create` and then `scripts/normalize-migrations.mjs`.
The second step is required, not cosmetic. Payload 3.87 generates:

```ts
import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'
```

`MigrateUpArgs` and `MigrateDownArgs` are **types**, used only in type position.
Every type-stripping loader — Node's native stripper,
`--experimental-transform-types`, and tsx alike — removes the annotations but
keeps the import binding, and Node then fails to link the module:

```
SyntaxError: The requested module '@payloadcms/db-postgres'
does not provide an export named 'MigrateDownArgs'
```

This is the erasable-syntax limitation rather than a loader bug, so the fix is to
mark the import `type`. The normalizer does that automatically. If you ever
generate a migration by calling the Payload binary directly, run the fix-up by
hand:

```bash
pnpm --filter @dhakalive/web normalize:migrations
```

`src/migrations` is excluded from `apps/web/tsconfig.json` and from ESLint. The
generated handlers declare `payload` and `req` whether or not a migration uses
them, which trips `noUnusedParameters`; relaxing that flag repo-wide to
accommodate generated code would be the wrong trade.

### After changing collections

```bash
pnpm --filter @dhakalive/web generate:types
```

Regenerates `src/payload-types.ts`. Run `generate:importmap` as well after adding
a custom admin component.

## 5. Run

```bash
pnpm dev
```

- Public site — http://localhost:3000
- CMS admin — http://localhost:3000/admin

The first visit to `/admin` prompts you to create the first user.

When editing anything under `packages/`, run the package watcher in a second
terminal so `dist` stays current:

```bash
pnpm watch:packages
```

## 6. Background worker

```bash
pnpm --filter @dhakalive/worker start
```

Phase 1 registers no jobs, so the loop is a no-op — but it proves the worker
boots, reaches Postgres and shuts down cleanly on `SIGTERM`. Scheduled
publishing, search indexing and cache purges are added in Phase 6.

Run exactly one worker. Multiple runners race on scheduled publication.

## 7. Full stack in Docker

```bash
docker compose up --build
```

Starts `postgres`, `redis`, `app` and `worker` together. Slower to iterate than
`pnpm dev`, but it is what validates the production images.

## Verifying a change

```bash
pnpm verify
```

Runs format check, lint, typecheck and tests — the same gate as CI. Add a
production build before opening a pull request:

```bash
pnpm build
```

## Troubleshooting

**`EnvValidationError` on start** — the message lists the exact keys. Compare
against `.env.example`; empty values (`KEY=`) are treated as unset, not invalid.

**Payload CLI cannot find the config** — run it through the workspace script
(`pnpm --filter @dhakalive/web migrate`), not the bare `payload` binary. The
script supplies the env file.

**Changes to `packages/*` are not picked up** — they compile to `dist`. Run
`pnpm build:packages` or keep `pnpm watch:packages` running.

**`Cannot connect to the Docker daemon`** — start Docker Desktop first.
