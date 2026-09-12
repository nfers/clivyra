import { expect, type APIRequestContext, type Page } from '@playwright/test'
import { apiBaseUrl, authFixtures } from './env'

/** Given: sessão autenticada via formulário de login da web (BFF cookies). */
export async function loginAs(
  page: Page,
  opts: { email: string; password: string; tenantSlug?: string },
): Promise<void> {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible()
  await page.getByLabel('E-mail').fill(opts.email)
  await page.getByLabel('Senha').fill(opts.password)

  const loginResponse = page.waitForResponse(
    (response) => response.url().includes('/api/session/login') && response.request().method() === 'POST',
    { timeout: 15_000 },
  )
  await page.getByRole('button', { name: /^Entrar$/i }).click()
  const first = await loginResponse
  if (!first.ok() && first.status() !== 409) {
    const alert = page.getByRole('alert')
    const message = (await alert.textContent().catch(() => null)) ?? `login HTTP ${first.status()}`
    throw new Error(`Login failed: ${message}`)
  }

  // Multi-tenant selection (only when API returns TENANT_SELECTION_REQUIRED).
  const studio = page.getByLabel(/^Studio$/i)
  if (await studio.isVisible().catch(() => false)) {
    if (opts.tenantSlug) {
      await studio.selectOption(opts.tenantSlug)
    } else {
      await studio.selectOption({ index: 1 })
    }
    const secondLogin = page.waitForResponse(
      (response) => response.url().includes('/api/session/login') && response.request().method() === 'POST',
      { timeout: 15_000 },
    )
    await page.getByRole('button', { name: /^Entrar$/i }).click()
    const second = await secondLogin
    if (!second.ok()) {
      const alert = page.getByRole('alert')
      const message = (await alert.textContent().catch(() => null)) ?? `login HTTP ${second.status()}`
      throw new Error(`Login failed after tenant selection: ${message}`)
    }
  }

  await page.waitForURL(/\/(app|onboarding)(\/|$)/, { timeout: 20_000 })
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
  if (!creds.email || !creds.password) {
    throw new Error(`Missing E2E credentials for role ${role}`)
  }
  await loginAs(page, {
    email: creds.email,
    password: creds.password,
    tenantSlug: fixtures.tenantSlug,
  })
}

/** API probe: returns true if /health is reachable. */
export async function isApiReachable(request: APIRequestContext): Promise<boolean> {
  try {
    const response = await request.get(`${apiBaseUrl()}/health`, { timeout: 5_000 })
    return response.ok()
  } catch {
    return false
  }
}
