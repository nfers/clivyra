# RBAC and permissions

CLI-13 adds reusable role-based access control for tenant-scoped API routes.

## Roles

Initial roles come from `MembershipRole`:

- `OWNER`
- `ADMIN`
- `PROFESSIONAL`
- `RECEPTION`

A role is always scoped to a tenant membership. A user can have different roles in different tenants.

## Permissions

Current permission groups:

- `agenda:read`
- `agenda:write`
- `clients:read`
- `clients:write`
- `finance:read`
- `finance:write`
- `clinical-record:read`
- `clinical-record:write`
- `settings:read`
- `settings:write`
- `users:read`
- `users:write`

Finance and clinical-record permissions are intentionally independent. A professional can access clinical records without automatically accessing finance. Reception can operate agenda/client workflows without clinical or finance access.

## Usage

Protected controllers should compose guards in this order:

```ts
@UseGuards(AuthAccessGuard, TenantContextGuard, RbacGuard)
@RequirePermissions('clinical-record:read')
```

Execution order matters:

1. `AuthAccessGuard` validates the access token and populates `request.user`.
2. `TenantContextGuard` verifies active tenant membership and populates `request.tenantContext`.
3. `RbacGuard` checks the required permissions against `request.tenantContext.role`.

## Deny by default

`RbacGuard` rejects protected routes that do not declare explicit permissions. This makes missing permission metadata a failing authorization configuration instead of an accidental allow.

Public routes should not use `RbacGuard`.

## User and role management

`OWNER` has `users:write` and can be used by future user-management endpoints to invite users, assign roles, and deactivate memberships.

`ADMIN` can manage users but does not receive `settings:write` by default. This keeps tenant-level configuration ownership separate from operational administration.
