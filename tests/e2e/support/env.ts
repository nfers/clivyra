/**
 * E2E environment helpers for Sprint 1 domain validation.
 * Authenticated flows require API + seeded fixtures (not started by default
 * playwright.config webServer, which only boots the web app).
 */

export function apiBaseUrl(): string {
  return process.env.API_BASE_URL ?? 'http://127.0.0.1:3001'
}

export function hasAuthFixtures(): boolean {
  return Boolean(process.env.E2E_OWNER_EMAIL && process.env.E2E_OWNER_PASSWORD)
}

export function authFixtures() {
  return {
    ownerEmail: process.env.E2E_OWNER_EMAIL ?? '',
    ownerPassword: process.env.E2E_OWNER_PASSWORD ?? '',
    adminEmail: process.env.E2E_ADMIN_EMAIL ?? '',
    adminPassword: process.env.E2E_ADMIN_PASSWORD ?? '',
    receptionEmail: process.env.E2E_RECEPTION_EMAIL ?? '',
    receptionPassword: process.env.E2E_RECEPTION_PASSWORD ?? '',
    professionalEmail: process.env.E2E_PROFESSIONAL_EMAIL ?? '',
    professionalPassword: process.env.E2E_PROFESSIONAL_PASSWORD ?? '',
    tenantSlug: process.env.E2E_TENANT_SLUG ?? 'studio-a',
  }
}

export function hasReceptionFixtures(): boolean {
  return Boolean(process.env.E2E_RECEPTION_EMAIL && process.env.E2E_RECEPTION_PASSWORD)
}

export function hasAdminFixtures(): boolean {
  return Boolean(process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD)
}

export function hasProfessionalFixtures(): boolean {
  return Boolean(process.env.E2E_PROFESSIONAL_EMAIL && process.env.E2E_PROFESSIONAL_PASSWORD)
}
