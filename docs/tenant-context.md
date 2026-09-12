# Tenant context

CLI-11 adds the multi-tenant foundation for Clivyra: schema, request/ALS context, mandatory Prisma tenant scoping, structured logging, and integration isolation tests.

## Data model

- `Tenant` represents a clinic or studio (global entity).
- `User` represents an authenticated person and can belong to more than one tenant (global entity).
- `Membership` links a user to a tenant with one role: `OWNER`, `ADMIN`, `PROFESSIONAL`, or `RECEPTION` (tenant-owned).

Tenant-owned domain entities must include a required `tenantId`, a foreign key to `Tenant` with `onDelete: Restrict`, and indexes that start with `tenantId`. Unique business keys are composed with `tenantId` first (example: `@@unique([tenantId, userId])`).

Model classification lives in `apps/api/src/prisma/tenant-owned-models.ts`. Every Prisma model must appear in `TENANT_OWNED_MODELS` or `GLOBAL_MODELS`; a unit test compares the lists to the Prisma DMMF.

## Request and tenant context

The API must not accept `tenantId` from frontend body, query, route parameters, or arbitrary headers as an authorization source.

`RequestContextMiddleware` validates or generates `X-Request-Id` (`^[A-Za-z0-9._-]{8,128}$`), captures IP and a truncated user-agent, stores them in `RequestContextStorage` (AsyncLocalStorage), and echoes `X-Request-Id` on every response.

Authentication (CLI-12) is expected to populate `request.user` with:

```ts
{
  userId: string
  currentTenantId: string
  sessionId?: string
}
```

`TenantContextGuard` validates that the user, tenant, and membership are active (via `bypassTenant('resolve-membership', …)`), then attaches the same context to:

- `request.tenantContext`
- `TenantContextStorage` (AsyncLocalStorage via `enterWith`)

Shared contracts live in `@clivyra/types` (`Role`, `AuthenticatedPrincipal`, `TenantContext`). Controllers read the resolved context through `@CurrentTenant()`.

## Prisma tenantScoped extension

`PrismaService` exposes a Prisma client extended with `tenantScoped`.

Prisma Client Extension hooks can drop Node AsyncLocalStorage across the query engine boundary. Clivyra therefore mirrors tenant and `bypassTenant` state by `requestId` (from `RequestContext`) so mandatory tenant filters remain correct under Nest async guards and concurrent requests.

- Tenant-owned operations inject/require `tenantId` from ALS / requestId bridge.
- `create` / `createMany` overwrite `data.tenantId`; a divergent client value raises `TenantScopeViolationError` (HTTP 400).
- Cross-tenant `update` / `delete` by id become not-found (HTTP 404).
- Missing ALS context on tenant-owned models raises `TenantContextMissingError` (HTTP 500, treated as a bug).
- `prisma.bypassTenant(reason, fn)` opts out for seed, membership resolution, and system jobs; each use is logged as `tenant_scope.bypass`.

`TenantPrismaService` remains available as explicit sugar (`where` / `createData` / `assertTenantOwnership`) and does not replace the extension.

## Health

- `GET /health` — liveness
- `GET /health/ready` — `SELECT 1` with a 2s timeout; `503` when the database is unavailable

## Logging

`AppLogger` writes JSON lines with `requestId`, and after the guard also `tenantId` / `userId`. Sensitive keys matching `password|token|secret|authorization|cookie|hash|pepper` are redacted. `console.*` is forbidden in `apps/api` via ESLint `no-console`.

## Standards

`npm run check:standards` runs `scripts/check-tenant-boundaries.mjs` and fails if `tenantId` appears in DTOs or in `@Query` / `@Param` / `@Body` / `@Headers('x-tenant…')` client input paths (allow with `// tenant-boundary: allow <reason>`).

## Seed

`npm run db:seed` creates an idempotent demo tenant and admin membership:

- `SEED_TENANT_SLUG`, default `clivyra-demo`
- `SEED_TENANT_NAME`, default `Clivyra Demo`
- `SEED_ADMIN_EMAIL`, default `admin@clivyra.local`
- `SEED_ADMIN_NAME`, default `Clivyra Admin`
- `SEED_ADMIN_PASSWORD_HASH`, optional

No default plaintext password is created by the seed.

## Integration harness

`npm run test:integration` boots Nest against Postgres, seeds fixtures `studio-a` / `studio-b`, and proves cross-tenant isolation on test-only routes `GET|POST|PATCH|DELETE /__test__/memberships` (registered only when `NODE_ENV=test`). Authentication is simulated with `x-test-principal` via `TestPrincipalGuard`.
