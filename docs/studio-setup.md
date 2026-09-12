# Studio setup (CLI-16)

## Models

Tenant-owned entities (always filtered by authenticated `tenantId`):

- `TenantSettings` (1:1 with tenant) — display name, legal fields, contact, timezone, logo key, onboarding
- `Professional` — optional `membershipId` link; status `DRAFT|ACTIVE|INACTIVE`
- `Service` — name, duration, category, active (no price — D9)
- `ProfessionalService` — N:N link (nested writes validate `serviceId` in-tenant)
- `Room` — name, capacity, active
- `WorkingHours` — studio defaults (`professionalId` null) or professional overrides

## Effective working hours (agenda contract)

`GET /working-hours/effective?professionalId&date`

- If the professional has **any** override rows, only overrides apply (no merge with studio defaults).
- Days without an override entry are **empty**, even if the studio has hours that day.
- If there are zero override rows, studio defaults are used.

## RBAC field projection

| Field | Visible to |
| --- | --- |
| `documentNumber` / `legalName` | `tenant:manage` (OWNER) — others get masked/null |
| `councilNumber`, `phone`, signature | `professionals:write` or the professional themselves |
| name, specialties, services | `professionals:read` (incl. RECEPTION) |

## Storage (D8)

`FileStoragePort` with:

- `local` driver (dev/test): `FILE_STORAGE_LOCAL_DIR`, signed URLs via `/storage/signed`
- `oci` stub: configure when Object Storage credentials exist (`infra/oci/README.md`)

Keys are always `tenants/<tenantId>/...` built server-side. SVG blocked for signatures; PNG/JPEG only.

## Onboarding

`GET /tenant/onboarding` → `{ steps, completed }`  
`POST /tenant/onboarding/complete` requires displayName, ≥1 ACTIVE professional, ≥1 default working-hours entry.

Invite accept for role `PROFESSIONAL` auto-creates a `DRAFT` professional linked to the new membership.
