/**
 * E2E environment helpers for Sprint 1 domain validation.
 * Fixtures are provided by `.env.e2e` (loaded in playwright.config.ts)
 * and seeded by `scripts/e2e/seed.ts`.
 */

export function apiBaseUrl(): string {
  return process.env.API_BASE_URL ?? 'http://127.0.0.1:3001'
}

export function hasAuthFixtures(): boolean {
  return Boolean(process.env.E2E_OWNER_EMAIL && process.env.E2E_OWNER_PASSWORD)
}

export function authFixtures() {
  const password = process.env.E2E_PASSWORD ?? process.env.E2E_OWNER_PASSWORD ?? ''
  return {
    ownerEmail: process.env.E2E_OWNER_EMAIL ?? '',
    ownerPassword: process.env.E2E_OWNER_PASSWORD ?? password,
    adminEmail: process.env.E2E_ADMIN_EMAIL ?? '',
    adminPassword: process.env.E2E_ADMIN_PASSWORD ?? password,
    receptionEmail: process.env.E2E_RECEPTION_EMAIL ?? '',
    receptionPassword: process.env.E2E_RECEPTION_PASSWORD ?? password,
    professionalEmail: process.env.E2E_PROFESSIONAL_EMAIL ?? '',
    professionalPassword: process.env.E2E_PROFESSIONAL_PASSWORD ?? password,
    tenantSlug: process.env.E2E_TENANT_SLUG ?? 'studio-a',
  }
}

export function hasReceptionFixtures(): boolean {
  return Boolean(process.env.E2E_RECEPTION_EMAIL && (process.env.E2E_RECEPTION_PASSWORD || process.env.E2E_PASSWORD))
}

export function hasAdminFixtures(): boolean {
  return Boolean(process.env.E2E_ADMIN_EMAIL && (process.env.E2E_ADMIN_PASSWORD || process.env.E2E_PASSWORD))
}

export function hasProfessionalFixtures(): boolean {
  return Boolean(
    process.env.E2E_PROFESSIONAL_EMAIL &&
      (process.env.E2E_PROFESSIONAL_PASSWORD || process.env.E2E_PASSWORD),
  )
}
