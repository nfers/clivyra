# Domain rules extracted — Sprint 1 (CLI-11..CLI-16)

Explicit testable rules from `docs/sprint-1/specs/` (source of truth for this review).

## CLI-11 Tenant isolation
1. Tenant-owned entities always carry `tenantId`.
2. `tenantId` is resolved only from the authenticated session (never body/query/route/header).
3. Queries on tenant-owned models fail without tenant context (except logged `bypassTenant`).
4. Cross-tenant read/update/delete by id returns 404 and affects 0 rows.
5. Inactive tenant/user/membership denies context (401 generic).
6. Concurrent requests do not mix tenant ALS context.

## CLI-12 Auth session
7. Private routes require authentication (API 401; web redirects `/login`).
8. Passwords stored only as strong hash (never plaintext / never in responses).
9. Refresh rotation; reuse of a rotated token revokes the entire `familyId`.
10. Logout / logout-all / password reset revoke sessions as specified.
11. Password-reset request always returns generic success (anti-enumeration).
12. Signup creates new tenant+OWNER only (no `role`/`tenantSlug` privilege path into existing tenant).
13. Lockout / throttle apply on login and reset.

## CLI-13 RBAC + invitations
14. Deny by default: undeclared route → 403 `ROUTE_PERMISSIONS_UNDECLARED`.
15. Sensitive modules use independent permissions (`finance:*`, `clinical-record:*`, `users:*`).
16. OWNER manages users; ADMIN cannot assign OWNER; self role/deactivate blocked; ≥1 OWNER.
17. Invitation role comes from persisted invitation, never accept body.
18. Cross-tenant membership id → 404.
19. Accept invitation for existing user requires password proof.

## CLI-14 Audit
20. Sensitive mutations emit AuditLog with actor/tenant/action/entity.
21. Metadata never stores password/token/secret (denylist + allowlist).
22. AuditLog is append-only (Prisma + DB trigger); no write API.
23. Query scoped by tenant; `audit:read` required (OWNER/ADMIN).
24. Cross-tenant audit id → 404.

## CLI-15 Consent / LGPD
25. Consent terms versioned per `(tenantId, type)`; publish immutable content.
26. ConsentRecord append-only; revoke inserts REVOKED with `supersedesId`; original unchanged.
27. Evidence `ipHash`/`userAgent` derived from request, never body.
28. LGPD export/erasure via registry; AUDIT/CONSENT retention = RETAIN.
29. Erasure anonymizes USER profile only when no active membership; never deletes AuditLog/ConsentRecord.
30. Cross-tenant consent/request → 404; `lgpd:manage` OWNER/ADMIN only (RECEPTION 403 on ERASURE).

## CLI-16 Studio / professional
31. `tenant:manage` (OWNER-only) required for legal fields (`legalName`, `document*`).
32. ADMIN may patch operational settings (`settings:write`) but 403 on legal fields.
33. Professional sensitive fields projected by RBAC (`professionals:write` or self).
34. RECEPTION sees name/specialties, not councilNumber/phone/signature.
35. `PATCH /professionals/me` allowlist only (no status/membershipId/serviceIds).
36. WorkingHours override replaces studio defaults entirely (no per-day merge).
37. Nested `serviceIds` must belong to current tenant.
38. Invitation PROFESSIONAL accept auto-creates Professional DRAFT.

## E2E harness

Playwright `webServer` sobe API+web via `scripts/e2e/start-*.sh`.
Fixtures sintéticas em `.env.e2e` + `scripts/e2e/seed.ts` (OWNER/ADMIN/PROFESSIONAL/RECEPTION + studio-b).
Cookies host-only (`AUTH_COOKIE_DOMAIN` vazio) para baseURL `http://127.0.0.1:3000`.
