import { expect, test } from '@playwright/test'
import { apiBaseUrl, hasAuthFixtures } from '../support/env'
import { isApiReachable, loginAsOwner } from '../support/auth'

/**
 * Feature: Isolamento multi-tenant (CLI-11)
 * Gherkin: tests/e2e/features/cli-11-tenant-isolation.feature
 *
 * Cross-tenant CRUD is proven in apps/api/test/integration/tenant-isolation.integration.spec.ts.
 * Playwright covers observable auth gate + request correlation.
 */
test.describe('Feature: Isolamento multi-tenant (CLI-11)', () => {
  test('Scenario: rota protegida exige autenticação', async ({ page }) => {
    // Given: visitante sem sessão
    // When: acessa área autenticada
    await page.goto('/app')

    // Then: redireciona para login preservando next
    await expect(page).toHaveURL(/\/login\?next=/)
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible()
  })

  test('Scenario: API /health propaga X-Request-Id', async ({ request }) => {
    // Given: API acessível (senão SKIP — gap de ambiente)
    if (!(await isApiReachable(request))) {
      test.skip(true, 'API não acessível; isolamento cross-tenant coberto por test:integration')
      return
    }

    // When: GET /health
    const response = await request.get(`${apiBaseUrl()}/health`)

    // Then: correlação presente
    expect(response.ok()).toBeTruthy()
    expect(response.headers()['x-request-id']).toMatch(/^[A-Za-z0-9._-]{8,128}$/)
  })

  test('Scenario: sessão autenticada permanece no próprio tenant (smoke)', async ({ page }) => {
    // Given: fixtures E2E de OWNER (senão SKIP)
    if (!hasAuthFixtures()) {
      test.skip(true, 'Defina E2E_OWNER_EMAIL/E2E_OWNER_PASSWORD para smoke autenticado')
      return
    }

    // When: OWNER autentica
    await loginAsOwner(page)

    // Then: shell do app/onboarding (sem vazamento de UI cross-tenant observável aqui)
    await expect(page).toHaveURL(/\/(app|onboarding)/)
  })
})
