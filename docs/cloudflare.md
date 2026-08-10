# Cloudflare setup

## Domains

| Hostname            | Purpose                        | Proxy   |
| ------------------- | ------------------------------ | ------- |
| `example.com`       | Public website                 | Proxied |
| `www.example.com`   | Redirect to the apex           | Proxied |
| `cms.example.com`   | Optional separate admin origin | Proxied |
| `media.example.com` | R2 bucket custom domain        | Proxied |

The first deployment serves the admin under `/admin` on the main app. Nothing in
the code assumes that: `NEXT_PUBLIC_SITE_URL` drives every generated URL, so
moving the admin to `cms.example.com` later is a deployment change.

Everything must stay proxied (orange cloud). A grey-clouded record exposes the
origin IP directly and bypasses the WAF, rate limiting and cache entirely.

## Cache rules

The application already sends the right `Cache-Control` for every route class —
see [`cache-policy.ts`](../apps/web/src/lib/cache/cache-policy.ts), which is unit
tested. Cloudflare should **respect origin headers** rather than override them,
so there is one source of truth.

| Rule order | Match                         | Action                             |
| ---------- | ----------------------------- | ---------------------------------- |
| 1          | `URI Path starts with /admin` | Bypass cache                       |
| 2          | `URI Path starts with /api`   | Bypass cache                       |
| 3          | `URI Path contains /search`   | Bypass cache                       |
| 4          | Everything else               | Cache eligible, respect origin TTL |

Order matters: the bypass rules must come first, or the catch-all will cache an
authenticated response.

### Cache key

Include, and nothing more:

- Host
- URI path
- The `page` query parameter

Explicitly **exclude** every other query string. Without an allowlist, anyone can
mint unlimited cache entries with `?utm_source=…` or `?x=1`, evicting real
content — and a poisoned variant can be served to other readers.

Do **not** add cookies, `Accept-Language` or any client-controlled header to the
cache key. Locale is already in the path.

### Why the origin still caches

Cloudflare's cache is not a substitute for the application's. A CDN miss, a
purge, or a new PoP all reach the origin, and without Next's route cache every
one of those becomes a database query storm. The two layers are invalidated
together from the same target list — see
[`revalidation-targets.ts`](../packages/core/src/cache/revalidation-targets.ts).

## Purging

Publishing an article, editing a section, or changing a global triggers
invalidation automatically. Both layers are driven from one pure function, so
they cannot disagree about what became stale.

### Plan matters

**Tag-based and prefix purge are Cloudflare Enterprise features.** On every other
plan the API rejects `tags`, so the default is single-file URL purge:

```
CLOUDFLARE_PURGE_BY_TAG=false   # default — purge enumerated URLs
CLOUDFLARE_PURGE_BY_TAG=true    # Enterprise only
```

URL purge is batched at 30 files per request, which is Cloudflare's limit.

One case URL purge cannot express: a change to the header, footer or site
settings affects every page on the site. There is no enumerable URL list for
that, so the application revalidates the locale _layout_ at the origin and
purges only the home page at the edge. Remaining pages age out under their own
TTL — at most five minutes. On Enterprise, tag purge clears them immediately.

### API token

Create a **scoped** token, never a global API key:

- Permissions: `Zone → Cache Purge → Purge`
- Zone resources: this one zone only

```
CLOUDFLARE_ZONE_ID=...
CLOUDFLARE_API_TOKEN=...
```

Validation refuses to start if one is set without the other — a half-configured
purge silently does nothing, which is worse than failing.

## Manual revalidation

```bash
curl -X POST https://example.com/api/revalidate \
  -H "x-revalidation-secret: $REVALIDATION_SECRET" \
  -H 'content-type: application/json' \
  -d '{"type":"locale","locale":"bn"}'
```

The endpoint accepts a described _event_, never a list of paths, so a caller
cannot ask the site to purge arbitrary URLs. The secret is compared in constant
time; `GET` returns 405.

## Security

| Feature       | Setting                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------- |
| TLS           | Full (strict). "Flexible" leaves origin traffic unencrypted.                                    |
| HSTS          | Enable once TLS is confirmed working, including subdomains.                                     |
| Always HTTPS  | On.                                                                                             |
| WAF           | Managed ruleset on. Add a rule blocking `/admin` outside office IPs if that suits the newsroom. |
| Rate limiting | `/api/users/login` — 5 requests/minute per IP. `/api/*` — 60/minute per IP.                     |
| Bot           | Managed challenge on `/api/users/login` and any public form.                                    |
| DDoS          | Default managed protection.                                                                     |

Rate limiting at the edge complements Payload's own lockout (5 attempts, 10
minute lock): the edge stops the traffic before it reaches the origin at all.

### Origin protection

The database, Redis and the app containers must not be reachable from the
internet. Put the origin behind Cloudflare Tunnel, or restrict the load
balancer's security group to [Cloudflare's IP ranges](https://www.cloudflare.com/ips/)
and add an `Authenticated Origin Pull` certificate. Otherwise an attacker who
learns the origin IP bypasses every protection above.

## Turnstile

Optional, for public forms (contact, tips). Add the site key as a public env var
and verify the token server-side before accepting a submission. Not wired up
yet — there are no public forms until the contact page gets one.
