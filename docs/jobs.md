# Background jobs

Everything the platform does asynchronously runs here: search indexing, cache
invalidation, scheduled publication, breaking-flag expiry, housekeeping.

## One runner

Jobs are executed by the `worker` container and by nothing else. Payload's
`autoRun` is deliberately not configured: it starts a cron inside any process
that loads the config, which in production is every web replica, and N replicas
polling the same queue publish the same scheduled article N times.

`JOBS_RUN_IN_PROCESS` is `true` only in the worker container, and the worker's
deployment is pinned to a single replica.

## Queues

Queues exist to keep unrelated failure modes apart. A Cloudflare outage filling
one queue with retrying purge jobs must not delay scheduled publication.

| Queue         | Contents                                    |
| ------------- | ------------------------------------------- |
| `content`     | Search indexing, cache invalidation         |
| `scheduled`   | Scheduled publication, breaking-flag expiry |
| `maintenance` | Housekeeping nobody is waiting on           |

## Retries

Sized to what a task talks to, in `apps/web/src/jobs/queues.ts`:

| Policy         | Attempts | Backoff             | For                         |
| -------------- | -------- | ------------------- | --------------------------- |
| `RETRY_REMOTE` | 4        | exponential from 2s | Third parties — CDN, search |
| `RETRY_LOCAL`  | 3        | fixed 1s            | Our own database            |
| `RETRY_SWEEP`  | 1        | fixed 30s           | Recurring sweeps            |

Sweeps get one attempt because the next scheduled run _is_ the retry; stacking
attempts on a recurring task is how a queue fills with duplicate sweeps.

## Idempotency

There is no separate idempotency ledger. Each task declares a `concurrency.key`
derived from its input — `search-index:articles:412` — and the job system
enforces two things against it:

- `exclusive`: only one job with that key runs at a time.
- `supersedes`: queueing a new one drops any earlier job with the same key that
  has not started. An editor saving five times in a minute produces one index
  job, not five.

Superseding never loses an edit, because a job carries an identity and not a
snapshot: it reads the document as it stands when it runs.

`supersedes` is used only for event-driven work. On a recurring sweep it would
be actively harmful — see the note in `jobs/sweeps.ts`.

None of this makes execution exactly-once, and nothing can: a job can always
fail after its side effect and be retried. Every handler is therefore idempotent
in its own right — upsert, delete-if-present, publish-if-still-scheduled. The
concurrency key is the optimisation; the handler is the guarantee.

## Dead letter

The jobs table is the dead-letter queue. When a job exhausts its attempts,
Payload sets `hasError`, stops retrying, and leaves the row with its full
per-attempt log attached.

`prune-jobs` deletes _completed_ jobs after a retention window and never touches
failures, so the table converges to exactly what needs attention. "What is
stuck?" is `hasError: true` in the admin list, with the error and every attempt
in one place — rather than a second table that would have to be kept in step
with this one.

Reading the collection requires `audit:read`; deleting from it requires
`audit:delete`, because deleting a failed job discards the only record of why it
failed. The job runner talks to the database directly, so these rules constrain
people and not the runner.

## Correlation IDs

A job runs minutes after — and in a different process from — the request that
caused it. The correlation id travels in the job's own input and every handler
logs with it, so a purge failure in the worker can be joined to the publish
request in a web replica. Without it, "the article published but the CDN still
serves the old copy" is two unrelated log streams.

## Recurring sweeps

Scheduled by the worker loop, in `apps/web/src/jobs/sweeps.ts`, rather than by
Payload's cron. Each sweep has an interval and a check for an outstanding job of
the same kind against indexed columns. The file explains why in detail.

| Sweep               | Every | Does                                          |
| ------------------- | ----- | --------------------------------------------- |
| `publish-scheduled` | 1 min | Publishes articles whose `scheduledAt` passed |
| `expire-breaking`   | 5 min | Clears expired `isBreaking` flags             |
| `prune-jobs`        | 6 h   | Deletes completed jobs older than 7 days      |

Sweeps are idempotent — each is "do whatever is due right now" — so the worst
case of an extra run is a query that finds nothing.

### Scheduled publication

The worker does not write `workflowStatus` directly. The update goes through the
same `beforeChange` hook an editor's request does, and the transition table has
an explicit `systemOnly` row for `scheduled → published` that only a caller
setting `req.context.isSystemTransition` can take — a flag not reachable from an
HTTP body.

So the publish guards still run: a story that lost its featured image between
being scheduled and being published is refused rather than published broken, and
the transition is recorded in `workflowHistory` like any other. A refused
article stays `scheduled`, the next sweep retries, and the failure is logged.

Articles are stamped with the time they were _meant_ to appear, not the moment
the sweep reached them, so ordering does not depend on runner latency.

## Revalidation outside a request

`revalidatePath` only works inside a Next request scope. A change made by the
worker cannot clear the origin's route cache from where it happens — the call
throws.

Hooks therefore branch on where they are running. Inside a request, `after()`
defers the work until the response is sent, so an editor's save never waits on
Cloudflare. Outside one, a `revalidate` job is queued and the worker posts the
change to `/api/revalidate`, which performs it inside a real request.

What travels is the _event_, never a list of paths. The endpoint validates it
field by field and derives the targets with the same pure function every
in-process caller uses, so holding the shared secret does not confer the ability
to purge arbitrary URLs.

## Operating

Watch the queue:

```sql
SELECT task_slug, queue, has_error, total_tried, created_at
FROM payload_jobs
WHERE completed_at IS NULL
ORDER BY created_at;
```

Everything that needs attention:

```sql
SELECT id, task_slug, error->>'message', total_tried
FROM payload_jobs
WHERE has_error;
```

A dead-lettered job is retried by clearing its error, which returns it to the
runnable set:

```sql
UPDATE payload_jobs SET has_error = false, error = NULL WHERE id = $1;
```
