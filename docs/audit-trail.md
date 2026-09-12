# Audit trail (CLI-14)

Append-only, tenant-scoped audit log for sensitive mutations and marked sensitive reads.

## Principles

- Every `AuditLog` row has `tenantId` (never from the client).
- No passwords, tokens, clinical free text, or raw IP addresses.
- IP is stored as `sha256(ip + AUDIT_IP_HASH_SALT)` only; never returned by the API.
- Rows are immutable: Postgres triggers reject `UPDATE`/`DELETE`; Prisma extension throws `AuditImmutableError` on `update*`/`delete*`/`upsert`.
- **Retention (D7):** no purge in P0. Clinical records may need ~20 years (CFM/COFFITO); audit retention should follow the data it describes. Decide with legal before commercial production. Extension point: future job with a distinct DB role that can disable triggers / `TRUNCATE` is out of app credentials.

## Recording events

### Explicit `AuditService`

```ts
await this.prisma.$transaction(async (tx) => {
  await tx.membership.updateMany({ ... })
  await this.audit.record(
    {
      action: 'users.role.changed',
      entityType: 'Membership',
      entityId: id,
      changes: { before, after, fields: ['role'] },
      tenantId: ctx.tenantId,
    },
    tx,
  )
})
```

- Mutations: call `record` in the **same transaction** so audit failure rolls back the change.
- Sensitive reads: `recordAccess` (best-effort; never fails the caller; emits `audit.write_failed`).

### `@Audited()` interceptor

```ts
@Post()
@Audited({ action: 'users.invitation.created', entityType: 'Invitation', entityIdFrom: 'result.id' })
create() { ... }
```

Records `SUCCESS` after the handler, `DENIED` on `ForbiddenException`. Does not record validation `400`s. Prefer explicit `record` when you need `changes`.

### Auth / user events

`AuthEventsAuditAdapter` implements `AuthEventsPort`: structured log + AuditLog when `tenantId` is known. Login failures for unknown emails stay in structured logs only (no tenant → no AuditLog). Pass `persist: false` when the service already wrote the row inside a transaction.

### `bypassTenant`

When a tenant is in ALS, `bypassTenant(reason)` also records `system.tenant_bypass` (best-effort). Reasons matching `audit-*` or `tenant-scoped-*` are skipped to avoid recursion.

## Metadata rules

1. **Denylist** (any depth): password, token, secret, cpf, … → `[REDACTED]` or stripped.
2. **Allowlist per action** in `apps/api/src/audit/audit-actions.ts`. Unknown keys are dropped (throw in `NODE_ENV=test`).
3. Strings > 512 chars truncated; payload > 8 KB marked `_truncated`.
4. Future `clinical-record.*` actions must not allow free-text keys (`notes`, `content`, …).

Catalog: `packages/types/src/audit.ts`.

## Query API

- `GET /audit-logs` — `audit:read` (OWNER, ADMIN). Filters: `from`/`to` (max 90 days), `action` (exact or prefix `users.`), entity, actor, outcome, cursor pagination.
- `GET /audit-logs/:id` — same permission; other tenant → `404`.
- Response never includes `ipHash` / `userAgent`.
- Listing is itself audited as `audit.queried`.

Web UI: `/app/configuracoes/auditoria` (read-only).

## Adding a new module

1. Add actions to `AUDIT_ACTIONS` and allowlists.
2. Call `AuditService.record` (or `@Audited`) from services/controllers.
3. Controllers under `clinical-record`, `finance`, `users`, `consent`, `professionals` with mutations must use `@Audited` or `AuditService` (`npm run check:standards`).
4. Never put clinical narrative or secrets in metadata.

## Environment

```env
AUDIT_IP_HASH_SALT=...   # required in production; must not be the local default
```

Boot fails in production if the salt is missing or still the development default.

## DB privileges

The application DB role must not have `TRUNCATE` on `AuditLog` in production. See `infra/oci/README.md`.
