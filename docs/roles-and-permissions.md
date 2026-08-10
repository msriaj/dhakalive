# Roles and permissions

## The model

Roles exist for humans. **Capabilities** are what the code checks.

A role is only ever a named bundle of capabilities plus a rank. No access rule
anywhere compares `user.role === 'editor'` — that pattern is what makes a
permission model impossible to change safely once it is spread across twenty
collections.

Everything lives in
[`packages/core/src/access`](../packages/core/src/access), which imports neither
Payload nor Next, so the rules are unit-testable without a framework or a
database.

| File              | Responsibility                              |
| ----------------- | ------------------------------------------- |
| `roles.ts`        | Role list and ranks                         |
| `capabilities.ts` | The capability list and the grant table     |
| `user.ts`         | `can()`, rank comparison, escalation guards |

The Payload bridge is [`apps/web/src/access`](../apps/web/src/access): thin
adapters turning capability checks into Payload `Access` functions.

## Roles

| Role          | Rank | Intent                                         |
| ------------- | ---- | ---------------------------------------------- |
| `contributor` | 10   | Writes drafts, cannot delete                   |
| `reporter`    | 20   | Staff writer; owns their drafts                |
| `editor`      | 30   | Reviews and requests changes, manages taxonomy |
| `publisher`   | 40   | Approves, schedules, publishes, unpublishes    |
| `admin`       | 50   | Manages users and system settings              |
| `super-admin` | 60   | Everything, including deleting audit records   |

Rank exists for exactly one purpose: **privilege-escalation defence**. It answers
"may this actor act on that user, or grant that role". Access decisions are made
on capabilities, never on rank.

## Capability matrix

Grants are cumulative — each role holds everything the role below it holds.
`capabilities.test.ts` asserts that monotonicity, so the table cannot silently
develop a hole.

| Capability                 | contrib | reporter | editor | publisher | admin | super |
| -------------------------- | :-----: | :------: | :----: | :-------: | :---: | :---: |
| `article:create`           |    ✓    |    ✓     |   ✓    |     ✓     |   ✓   |   ✓   |
| `article:read.own`         |    ✓    |    ✓     |   ✓    |     ✓     |   ✓   |   ✓   |
| `article:update.own`       |    ✓    |    ✓     |   ✓    |     ✓     |   ✓   |   ✓   |
| `article:submit`           |    ✓    |    ✓     |   ✓    |     ✓     |   ✓   |   ✓   |
| `media:upload`             |    ✓    |    ✓     |   ✓    |     ✓     |   ✓   |   ✓   |
| `article:delete.own`       |    —    |    ✓     |   ✓    |     ✓     |   ✓   |   ✓   |
| `liveblog:manage.own`      |    —    |    ✓     |   ✓    |     ✓     |   ✓   |   ✓   |
| `article:read.any`         |    —    |    —     |   ✓    |     ✓     |   ✓   |   ✓   |
| `article:update.any`       |    —    |    —     |   ✓    |     ✓     |   ✓   |   ✓   |
| `article:review`           |    —    |    —     |   ✓    |     ✓     |   ✓   |   ✓   |
| `article:archive`          |    —    |    —     |   ✓    |     ✓     |   ✓   |   ✓   |
| `taxonomy:manage`          |    —    |    —     |   ✓    |     ✓     |   ✓   |   ✓   |
| `author:manage`            |    —    |    —     |   ✓    |     ✓     |   ✓   |   ✓   |
| `media:manage.any`         |    —    |    —     |   ✓    |     ✓     |   ✓   |   ✓   |
| `liveblog:manage.any`      |    —    |    —     |   ✓    |     ✓     |   ✓   |   ✓   |
| `globals:manage.editorial` |    —    |    —     |   ✓    |     ✓     |   ✓   |   ✓   |
| `article:approve`          |    —    |    —     |   —    |     ✓     |   ✓   |   ✓   |
| `article:schedule`         |    —    |    —     |   —    |     ✓     |   ✓   |   ✓   |
| `article:publish`          |    —    |    —     |   —    |     ✓     |   ✓   |   ✓   |
| `article:unpublish`        |    —    |    —     |   —    |     ✓     |   ✓   |   ✓   |
| `ads:manage`               |    —    |    —     |   —    |     ✓     |   ✓   |   ✓   |
| `redirect:manage`          |    —    |    —     |   —    |     ✓     |   ✓   |   ✓   |
| `article:delete.any`       |    —    |    —     |   —    |     —     |   ✓   |   ✓   |
| `globals:manage.system`    |    —    |    —     |   —    |     —     |   ✓   |   ✓   |
| `users:manage`             |    —    |    —     |   —    |     —     |   ✓   |   ✓   |
| `audit:read`               |    —    |    —     |   —    |     —     |   ✓   |   ✓   |
| `audit:delete`             |    —    |    —     |   —    |     —     |   —   |   ✓   |

### Choices worth explaining

**Editors cannot hard-delete articles.** `article:archive` is the reversible path
editorial staff use. Destroying a published story with its version history is an
administrative action, so `article:delete.any` starts at `admin`.

**Audit logs are append-only for admins.** Only `super-admin` holds
`audit:delete`. An administrator who can erase the record of their own actions
makes the audit trail worthless.

**Globals are split.** Editors control the homepage layout and breaking-news
ticker (`globals:manage.editorial`). Site settings and SEO defaults
(`globals:manage.system`) stay with administrators.

## Escalation defence

Four rules, all enforced in `validateRoleAssignment`:

1. **No self-service roles.** Nobody can change their own roles — including a
   super-admin. This blocks a hijacked session from widening its own permissions,
   and stops an administrator locking themselves out by accident.
2. **No peers, no superiors.** An actor cannot modify a user at or above their
   own rank. An admin cannot demote another admin.
3. **No granting up.** An actor can only grant or revoke roles strictly below
   their own rank. Only a super-admin can confer `super-admin`.
4. **The last super-admin is protected.** Neither demotion nor deletion may
   remove the final `super-admin` account.

Rule 2 has one deliberate exception: a super-admin may act on another
super-admin. Without it there would be no in-app way to revoke a compromised
top-level account.

Only the **difference** between current and requested roles is authorised, not
the resulting set — so an admin editing a peer's unrelated profile field is not
blocked by roles they could never have granted. Current roles are always read
from the persisted document, never from the request body; trusting a
client-supplied "previous" value would let an attacker fake a no-op diff.

## Where enforcement lives

| Concern                                | Where                                 | Why there                                           |
| -------------------------------------- | ------------------------------------- | --------------------------------------------------- |
| Does this user hold the capability?    | Collection `access`                   | Runs on REST, GraphQL, Local API and admin alike    |
| Can they only see their own documents? | `Where` returned from `access.read`   | Payload turns it into SQL — a UI filter would not   |
| Does the actor outrank the target?     | `beforeChange` / `beforeDelete` hooks | Access callbacks get an id, not the target document |

### Why `roles` has no field-level access

Payload enforces field access by **stripping the field from incoming data before
hooks run**. With `access.update` on `roles`, a reporter POSTing
`roles: ['admin']` gets a `200` with roles silently unchanged — the escalation is
blocked, but it looks like it succeeded and leaves no signal that anyone tried.

Enforcement therefore lives entirely in the `beforeChange` hook, which sees the
requested value and rejects with an explicit `403`. The admin UI still hides the
control from users who cannot use it, via `admin.condition` — presentation only.

### Ownership constraints

`.own` capabilities are enforced by returning a `Where` from the access callback,
not by filtering results afterwards:

```ts
return { [ownerField]: { equals: user.id } }
```

Payload applies that constraint identically to REST, GraphQL, the Local API and
the admin list view. This is the only approach that closes the direct-API hole —
a reporter cannot read another reporter's draft by calling `/api/articles`
directly, because the constraint is part of the SQL.

## First-user bootstrap

Creating a user requires `users:manage`, with one exception: while the users
table is **empty**, an unauthenticated create is allowed. That path is reachable
exactly once in the lifetime of an installation, and the hook forces the
resulting account to `super-admin` rather than trusting the request body.

Every account after that is created through an authenticated actor, subject to
all four escalation rules.

## Session security

| Setting            | Value                    | Reason                                                         |
| ------------------ | ------------------------ | -------------------------------------------------------------- |
| `tokenExpiration`  | 2 hours                  | Limits the window of a stolen session cookie                   |
| `maxLoginAttempts` | 5                        | Credential-stuffing resistance                                 |
| `lockTime`         | 10 minutes               | Slows brute force without a permanent lockout                  |
| `cookies.sameSite` | `Lax`                    | First line of CSRF defence, alongside Payload's CSRF allowlist |
| `cookies.secure`   | true outside development | No TLS locally; required everywhere else                       |
| `unlock`           | `users:manage`           | Bypassing the lockout is an administrative action              |

## Testing

| Layer       | Location                                          | Covers                                             |
| ----------- | ------------------------------------------------- | -------------------------------------------------- |
| Unit        | `packages/core/src/access/*.test.ts`              | Matrix monotonicity, rank rules, escalation guards |
| Integration | `apps/web/tests/integration/users-access.test.ts` | The rules as Payload actually applies them         |

Integration tests run against a real PostgreSQL database through the Local API
with `overrideAccess: false` — the same path REST and GraphQL take. Testing the
capability helpers alone would not catch a collection wired to the wrong rule,
and would not prove that a `Where` constraint actually filters rows.

```bash
pnpm test:integration
```

## Adding a capability

1. Add it to `CAPABILITIES` in `capabilities.ts`.
2. Grant it in `CAPABILITY_GRANTS` at the lowest role that should hold it.
3. Use it via `hasCapability('your:capability')` in the collection.
4. Add a unit test asserting which roles hold it, and an integration test for the
   behaviour it gates.
5. Update the matrix above.

Never add a role check to a collection. If a rule cannot be expressed as a
capability, that is a sign the capability list is missing an entry.
