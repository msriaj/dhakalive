# DhakaLive

A bilingual (Bengali / English) news publishing platform built on Payload CMS,
Next.js, PostgreSQL and Cloudflare.

> **Status: Phases 1–3 of 8 complete.**
> Foundation, the permission model and the editorial content model are in place,
> with Docker images built and verified. The public site, caching, search, jobs
> and SEO are built in later phases. See
> [Implementation phases](#implementation-phases).

---

## Requirements

| Tool       | Version                         |
| ---------- | ------------------------------- |
| Node.js    | ≥ 20.9 (developed on 24.11)     |
| pnpm       | 11.x (`corepack enable`)        |
| Docker     | for local PostgreSQL and Redis  |
| PostgreSQL | 17 (via Docker Compose locally) |

## Quick start

```bash
pnpm install
```

```bash
cp .env.example .env
```

Generate the two secrets and paste them into `.env`:

```bash
openssl rand -base64 48
```

```bash
openssl rand -hex 32
```

Start PostgreSQL and Redis:

```bash
docker compose up -d postgres redis
```

Create the schema, then run the app:

```bash
pnpm --filter @dhakalive/web migrate
```

```bash
pnpm dev
```

- Public site — http://localhost:3000
- CMS admin — http://localhost:3000/admin (first visit creates the first user)

Full walkthrough: [docs/local-setup.md](docs/local-setup.md).

## Repository layout

```
apps/web            Next.js app — public site, Payload admin (/admin), Payload API (/api)
packages/config     Environment validation (Zod) and locale definitions
packages/core       Domain rules — slugs, capabilities, workflow, revalidation targets
packages/observability  Structured logging, correlation IDs, redaction
services/worker     Background job runner (own container, exactly one replica)
docker/             Production Dockerfiles
docs/               Architecture, setup and operations documentation
```

`packages/core` imports neither Payload nor Next. That constraint is what keeps
the access-control and workflow rules unit-testable in isolation, and what makes
splitting the CMS, the public site and the worker into separate services a
packaging change rather than a rewrite.

## Commands

| Command                                       | What it does                                       |
| --------------------------------------------- | -------------------------------------------------- |
| `pnpm dev`                                    | Run the web app in development                     |
| `pnpm build`                                  | Production build                                   |
| `pnpm verify`                                 | Format check, lint, typecheck, tests — the CI gate |
| `pnpm lint` / `lint:fix`                      | ESLint                                             |
| `pnpm typecheck`                              | Build workspace packages, then typecheck apps      |
| `pnpm test`                                   | Vitest unit suite (no database needed)             |
| `pnpm test:integration`                       | Permission tests against a real PostgreSQL         |
| `pnpm build:packages`                         | Compile `packages/*` to `dist`                     |
| `pnpm --filter @dhakalive/web migrate`        | Apply database migrations                          |
| `pnpm --filter @dhakalive/web generate:types` | Regenerate `payload-types.ts`                      |

`packages/*` compile to `dist` before the app builds, so run `pnpm build:packages`
(or `pnpm watch:packages` alongside `pnpm dev`) after changing a package.

## Documentation

- [Local setup](docs/local-setup.md)
- [Environment variables](docs/environment.md)
- [Architecture](docs/architecture.md)
- [Roles and permissions](docs/roles-and-permissions.md)
- [Content model](docs/content-model.md)
- [Editorial workflow](docs/editorial-workflow.md)

Cloudflare setup, R2 CORS, deployment, backup/restore, scaling and incident
notes are written as the phases that introduce them land.

## Implementation phases

| Phase | Scope                                                                      | Status  |
| ----- | -------------------------------------------------------------------------- | ------- |
| 1     | Foundation — workspace, Payload + Next, Postgres, env, Docker, CI          | ✅ done |
| 2     | Authentication and permissions — roles, capabilities, access control       | ✅ done |
| 3     | Editorial content — Articles, Categories, Tags, Authors, Media, Live Blogs | ✅ done |
| 4     | Public website — layout, homepage, article, listings, accessibility        | next    |
| 5     | Cloudflare and caching — R2, cache headers, revalidation, purge            | —       |
| 6     | Search, jobs and scheduling                                                | —       |
| 7     | SEO and feeds                                                              | —       |
| 8     | Hardening — security headers, rate limiting, audit logs, observability     | —       |

Every phase ends with the same gate: format, lint, typecheck, tests, production
build. A phase is not complete with a red gate.

## Version constraints

Three pins in `pnpm-workspace.yaml` are load-bearing, not arbitrary:

- **`graphql` 16.14.2** — `payload@3.87.1` declares a `^16.8.1` peer. graphql 17
  breaks Payload's GraphQL layer.
- **`typescript` 5.9.3** — `typescript-eslint@8` supports `typescript <6.1.0`.
  TypeScript 7 is published as `latest` but would disable every typed lint rule.
- **`eslint` 9.39.5** — the plugins bundled by `eslint-config-next@16.3.0`
  (`import`, `react`, `jsx-a11y`) do not yet declare eslint 10 support.

`next` is pinned to 16.3.0 because `@payloadcms/next@3.87.1` accepts an explicit
allowlist — `>=15.2.9 <15.3.0 || >=15.3.9 <15.4.0 || >=15.4.11 <15.5.0 || >=16.2.6 <17.0.0`.
Note that 15.5.x is _excluded_; do not downgrade into that band.
