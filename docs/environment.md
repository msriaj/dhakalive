# Environment variables

Validation lives in [`packages/config/src/env.ts`](../packages/config/src/env.ts)
and runs at process start. A missing or malformed value fails immediately and
lists **every** offending key at once. Values are never included in error output.

Two schemas are kept deliberately separate:

- `serverEnvSchema` — may contain secrets, parsed only in Node contexts.
- `clientEnvSchema` — restricted to `NEXT_PUBLIC_*`, the only values allowed to
  reach a browser bundle.

Anything not prefixed `NEXT_PUBLIC_` is server-only and never bundled.

## `APP_ENV` vs `NODE_ENV`

`NODE_ENV` is a **build** concept. `next build` forces it to `production` even
for a local build, and every built artifact reports `production` no matter where
it runs — so it cannot distinguish staging from production either.

`APP_ENV` is the **deployment** concept, and it is what the production safety
rules check. Set it explicitly in every environment.

| `APP_ENV`     | Effect                                                               |
| ------------- | -------------------------------------------------------------------- |
| `development` | No production rules. Insecure cookies allowed (no local TLS).        |
| `test`        | As development; used by CI.                                          |
| `staging`     | Production-shaped, but the hard requirements below are not enforced. |
| `production`  | R2 required, TLS required, schema push refused.                      |

## Reference

### Runtime

| Variable    | Required | Default       | Notes                         |
| ----------- | -------- | ------------- | ----------------------------- |
| `APP_ENV`   | no       | `development` | Deployment stage — see above. |
| `NODE_ENV`  | no       | `development` | Build mode. Set by tooling.   |
| `LOG_LEVEL` | no       | `info`        | `fatal`…`trace`.              |

### Public site identity

| Variable                     | Required | Notes                                               |
| ---------------------------- | -------- | --------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`       | **yes**  | Canonical origin. Also the CORS and CSRF allowlist. |
| `NEXT_PUBLIC_MEDIA_URL`      | no       | Public media hostname for the browser.              |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | no       | `bn` (default) or `en`.                             |
| `NEXT_PUBLIC_APP_VERSION`    | no       | Commit SHA or tag; reported by `/api/health`.       |

### Payload

| Variable         | Required | Notes                                                                             |
| ---------------- | -------- | --------------------------------------------------------------------------------- |
| `PAYLOAD_SECRET` | **yes**  | Minimum 32 chars. Signs auth cookies and reset tokens. `openssl rand -base64 48`. |

Rotating `PAYLOAD_SECRET` invalidates every active session and every outstanding
password-reset link.

### PostgreSQL

| Variable            | Required | Default | Notes                                            |
| ------------------- | -------- | ------- | ------------------------------------------------ |
| `DATABASE_URI`      | **yes**  | —       | Connection string.                               |
| `DATABASE_POOL_MIN` | no       | `2`     | Must not exceed the maximum.                     |
| `DATABASE_POOL_MAX` | no       | `10`    | Per instance — multiply by replica count.        |
| `DATABASE_SSL`      | no       | `false` | **Required `true` in production.**               |
| `DATABASE_PUSH`     | no       | `false` | Dev-only schema sync. **Refused in production.** |

`DATABASE_POOL_MAX` is per application instance. Two web replicas at 10 plus a
worker at 10 is 30 connections; size the database (or its pooler) accordingly.

### Cloudflare R2 (media)

All five are **required when `APP_ENV=production`** — media is never written to
container disk.

| Variable                          | Notes                                                                      |
| --------------------------------- | -------------------------------------------------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID`           | Cloudflare account identifier.                                             |
| `CLOUDFLARE_R2_BUCKET`            | Bucket name.                                                               |
| `CLOUDFLARE_R2_ACCESS_KEY_ID`     | R2 access key.                                                             |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | R2 secret key.                                                             |
| `CLOUDFLARE_R2_ENDPOINT`          | `https://<account-id>.r2.cloudflarestorage.com`.                           |
| `CLOUDFLARE_R2_REGION`            | Defaults to `auto`. R2 has no regions, but the S3 client requires a value. |
| `CLOUDFLARE_R2_FORCE_PATH_STYLE`  | Defaults to `true`. R2 requires path-style addressing.                     |
| `CLOUDFLARE_MEDIA_PUBLIC_URL`     | Public custom domain bound to the bucket.                                  |

> These names are ours; `@payloadcms/storage-s3` takes a config object rather
> than reading env directly. The adapter needs `region` and `forcePathStyle`
> beyond the list in the original specification — both are included above.

### Cloudflare cache purge

| Variable                  | Notes                                                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_ZONE_ID`      | Must be set together with the token, or purges silently no-op.                                             |
| `CLOUDFLARE_API_TOKEN`    | Scope to **Zone → Cache Purge** on this one zone. Never a global key.                                      |
| `CLOUDFLARE_PURGE_BY_TAG` | Default `false`. Tag and prefix purge are Enterprise-only; other plans fall back to single-file URL purge. |

Validation rejects setting one of zone/token without the other.

### Revalidation

| Variable              | Required | Notes                                                                |
| --------------------- | -------- | -------------------------------------------------------------------- |
| `REVALIDATION_SECRET` | **yes**  | Minimum 16 chars. Compared in constant time. `openssl rand -hex 32`. |

### Redis, search, email, jobs

| Variable                                                  | Default    | Notes                                                                                                              |
| --------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------ |
| `REDIS_URL`                                               | —          | Rate limiting and distributed cache.                                                                               |
| `SEARCH_PROVIDER`                                         | `postgres` | `postgres` \| `meilisearch` \| `opensearch`.                                                                       |
| `SEARCH_URL`                                              | —          | **Required** unless the provider is `postgres`.                                                                    |
| `SEARCH_API_KEY`                                          | —          | Provider API key.                                                                                                  |
| `EMAIL_FROM`                                              | —          | Must be a valid address if set.                                                                                    |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | —          | Outbound mail.                                                                                                     |
| `JOBS_RUN_IN_PROCESS`                                     | `false`    | **Worker container only.** If a web replica enables it, every replica races to publish the same scheduled article. |
| `JOBS_POLL_INTERVAL_MS`                                   | `10000`    | Minimum 1000.                                                                                                      |
| `ERROR_TRACKING_DSN`                                      | —          | Error-tracking endpoint.                                                                                           |

## Secret handling

- `.env` is gitignored. Only `.env.example` is committed, and it holds
  placeholders — never a real credential.
- Production secrets belong in the platform's secret manager, injected as
  environment variables at runtime. Never bake them into an image.
- The image build sets `SKIP_ENV_VALIDATION=1` because no secrets exist at build
  time. The **running container still validates for real** — this is not a way to
  skip validation in production.
- Logging redacts `password`, `token`, `secret`, `apiKey`, `authorization` and
  `cookie` paths. See
  [`packages/observability/src/redact.ts`](../packages/observability/src/redact.ts).
