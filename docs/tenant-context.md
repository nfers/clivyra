# Tenant context

CLI-11 adds the first multi-tenant foundation for Clivyra.

## Data model

- `Tenant` represents a clinic or studio.
- `User` represents an authenticated person and can belong to more than one tenant.
- `Membership` links a user to a tenant with one role: `OWNER`, `ADMIN`, `PROFESSIONAL`, or `RECEPTION`.

Tenant-owned domain entities must include a required `tenantId`, a foreign key to `Tenant`, and indexes that start with `tenantId`.

## Request context

The API must not accept `tenantId` from frontend body, query, route parameters, or arbitrary headers as authorization source.

Authentication is expected to populate `request.user` with:

```ts
{
  id: string
  currentTenantId: string
}
```

`TenantContextGuard` validates that the user, tenant, and membership are active, then attaches:

```ts
{
  userId: string
  tenantId: string
  membershipId: string
  role: MembershipRole
}
```

Controllers and services should read the resolved context through `@CurrentTenant()` and pass `tenantId` explicitly into tenant-owned queries.

## Prisma tenant-scoped queries

Use `TenantPrismaService` when building Prisma `where` clauses or create payloads for tenant-owned entities:

```ts
const where = tenantPrisma.where(tenantContext, { id: params.id })
const data = tenantPrisma.createData(tenantContext, dto)
```

The helper always takes `tenantId` from the authenticated `TenantContext` and discards any `tenantId` that may have arrived from client-controlled input. This is intentional: frontend-provided tenant identifiers are never an authorization source.

Before updating or deleting a previously loaded tenant-owned entity, call:

```ts
tenantPrisma.assertTenantOwnership(tenantContext, entity)
```

This prevents IDOR-style mutations when an identifier belongs to another tenant.

## Seed

`npm run db:seed` creates an idempotent demo tenant and admin membership:

- `SEED_TENANT_SLUG`, default `clivyra-demo`
- `SEED_TENANT_NAME`, default `Clivyra Demo`
- `SEED_ADMIN_EMAIL`, default `admin@clivyra.local`
- `SEED_ADMIN_NAME`, default `Clivyra Admin`
- `SEED_ADMIN_PASSWORD_HASH`, optional

No default plaintext password is created by the seed.
