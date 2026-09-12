import type { Page, APIRequestContext } from '@playwright/test'
import { authFixtures, apiBaseUrl } from './env'

/** Given: sessão autenticada via formulário de login da web (BFF cookies). */
export async function loginAs(
  page: Page,
  opts: { email: string; password: string; tenantSlug?: string },
): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(opts.email)
  await page.getByLabel('Senha').fill(opts.password)
  if (opts.tenantSlug) {
    const studioField = page.getByLabel(/studio|tenant|slug/i)
    if (await studioField.count()) {
      await studioField.fill(opts.tenantSlug)
    }
  }
  await page.getByRole('button', { name: /entrar/i }).click()
  await page.waitForURL(/\/(app|onboarding)/)
}

export async function loginAsOwner(page: Page): Promise<void> {
  const fixtures = authFixtures()
  await loginAs(page, {
    email: fixtures.ownerEmail,
    password: fixtures.ownerPassword,
    tenantSlug: fixtures.tenantSlug,
  })
}

export async function loginAsRole(
  page: Page,
  role: 'OWNER' | 'ADMIN' | 'PROFESSIONAL' | 'RECEPTION',
): Promise<void> {
  const fixtures = authFixtures()
  const map = {
    OWNER: { email: fixtures.ownerEmail, password: fixtures.ownerPassword },
    ADMIN: { email: fixtures.adminEmail, password: fixtures.adminPassword },
    PROFESSIONAL: {
      email: fixtures.professionalEmail,
      password: fixtures.professionalPassword,
    },
    RECEPTION: {
      email: fixtures.receptionEmail,
      password: fixtures.receptionPassword,
    },
  } as const
  const creds = map[role]
  await loginAs(page, {
    email: creds.email,
    password: creds.password,
    tenantSlug: fixtures.tenantSlug,
  })
}

/** API probe: returns true if /health is reachable (domain API E2E possible). */
export async function isApiReachable(request: APIRequestContext): Promise<boolean> {
  try {
    const response = await request.get(`${apiBaseUrl()}/health`, { timeout: 3_000 })
    return response.ok()
  } catch {
    return false
  }
}
