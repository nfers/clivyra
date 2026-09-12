# RBAC and permissions

CLI-13 adds reusable role-based access control for tenant-scoped API routes, plus tenant user management (invite, role change, deactivate).

## Guard order

Global `APP_GUARD` registration (fixed):

1. `ThrottlerGuard`
2. `AuthGuard` — validates access token; skips `@Public()`
3. `TenantContextGuard` — resolves active membership; skips `@Public()` and `@NoTenant()`
4. `RbacGuard` — checks permissions; skips `@Public()` and `@NoTenant()`; **deny by default**

```ts
@RequirePermissions('clinical-record:read')
@Get()
list() { /* ... */ }
```

## Decorators

| Decorator | Effect |
| --- | --- |
| `@Public()` | No auth, no tenant, no RBAC (health, login, invite accept) |
| `@NoTenant()` | Auth required; no tenant membership; RBAC skipped (allowlisted auth self-service routes) |
| `@RequirePermissions(...perms)` | AND of permissions. Empty list = any authenticated tenant role |
| `@RequireAnyPermission(...perms)` | OR of permissions |

Routes without `@Public`, `@NoTenant`, or permission metadata return `403` with `ROUTE_PERMISSIONS_UNDECLARED` (configuration bug). Missing permissions return generic `403 FORBIDDEN`.

`@NoTenant` is restricted to an allowlist checked by `router-coverage.integration.spec.ts`.

## Shared catalog

Source of truth: `packages/types/src/rbac.ts` (imported by API and web).

Roles: `OWNER`, `ADMIN`, `PROFESSIONAL`, `RECEPTION`.

Permissions (P0):

- `agenda:read` / `agenda:write`
- `clients:read` / `clients:write`
- `finance:read` / `finance:write`
- `clinical-record:read` / `clinical-record:write`
- `settings:read` / `settings:write`
- `users:read` / `users:write`

Finance and clinical-record are independent. D4: `ADMIN` keeps clinical-record access in P0.

`OWNER` and `ADMIN` currently share the full P0 catalog. CLI-16 will add `tenant:manage` as OWNER-only.

Helpers: `hasPermission`, `hasEveryPermission`, `canAssignRole`, `rolePermissions`.

## Adding a permission (future cards)

1. Append to `PERMISSIONS` in `packages/types/src/rbac.ts`.
2. Update `ROLE_PERMISSIONS` for each role.
3. Update the explicit matrix in `apps/api/src/rbac/permissions.matrix.spec.ts`.
4. Annotate new routes with `@RequirePermissions(...)`.
5. Extend integration probes/matrix if the module is new.

## Service-level authorization

```ts
constructor(private readonly authorization: AuthorizationService) {}

this.authorization.assert(ctx, 'finance:read')
const safe = this.authorization.project(ctx, dto, { balance: 'finance:read' })
```

Use this for field-level rules that do not belong on the controller.

## User management

Prefix `/users` (requires `users:read` / `users:write`):

- list members, invite by email, resend/revoke invitations
- change role, deactivate/activate membership

Public invite flow:

- `GET /auth/invitations/:token`
- `POST /auth/invitations/accept`

Invariants:

- ≥ 1 active `OWNER` per tenant (`409 LAST_OWNER`)
- `ADMIN` cannot grant `OWNER`
- actors cannot change their own role / deactivate themselves (after last-owner check)
- invitation role comes from the persisted invite, never from the accept body
- existing users must prove password ownership to accept
- deactivate revokes refresh sessions for that user **in that tenant**

## Web

- `usePermissions()` / `<Can permission="…">` (cosmetic only; API enforces)
- `/app/configuracoes/usuarios`
- `/convite/[token]`

## Env

| Variable | Default | Notes |
| --- | --- | --- |
| `INVITATION_TTL_HOURS` | `72` | Invitation lifetime |

## Events (for CLI-14)

`users.invitation.created|resent|revoked|accepted`, `users.role.changed`, `users.membership.deactivated|activated` via `AuthEventsPort`.
