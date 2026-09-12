import { expect, test } from '@playwright/test'
import {
  hasAdminFixtures,
  hasAuthFixtures,
  hasProfessionalFixtures,
  hasReceptionFixtures,
} from '../support/env'
import { loginAsRole } from '../support/auth'

/**
 * Feature: Perfil profissional e studio (CLI-16)
 * Gherkin: tests/e2e/features/cli-16-studio.feature
 *
 * RBAC de campos legais / projeção sensível / working-hours effective →
 * studio.integration.spec.ts + professional.policy / working-hours.policy.
 */
test.describe('Feature: Perfil profissional e studio (CLI-16)', () => {
  test('Scenario: visitante não acessa configuração do studio', async ({ page }) => {
    // Given/When
    await page.goto('/app/configuracoes/studio')

    // Then
    await expect(page).toHaveURL(/\/login\?next=/)
  })

  test('Scenario: visitante não acessa profissionais', async ({ page }) => {
    await page.goto('/app/configuracoes/profissionais')
    await expect(page).toHaveURL(/\/login\?next=/)
  })

  test('Scenario: dados legais só para OWNER (ADMIN não vê CNPJ/razão)', async ({ page }) => {
    if (!hasAdminFixtures()) {
      test.skip(true, 'E2E_ADMIN_* ausente — campo legal coberto por studio.integration.spec.ts')
      return
    }

    // Given: ADMIN autenticado
    await loginAsRole(page, 'ADMIN')

    // When: abre configuração do studio
    await page.goto('/app/configuracoes/studio')

    // Then: campos legais ausentes (UI espelha tenant:manage)
    await expect(page.locator('input[name="legalName"]')).toHaveCount(0)
    await expect(page.locator('input[name="documentNumber"]')).toHaveCount(0)
  })

  test('Scenario: OWNER autenticado alcança studio settings', async ({ page }) => {
    if (!hasAuthFixtures()) {
      test.skip(true, 'E2E_OWNER_* ausente')
      return
    }

    await loginAsRole(page, 'OWNER')
    await page.goto('/app/configuracoes/studio')
    await expect(page).not.toHaveURL(/\/login/)
    await expect(
      page.getByRole('heading', { name: /studio|configura/i }).or(page.locator('input[name="displayName"]')),
    ).toBeVisible({ timeout: 8_000 })
  })

  test('Scenario: profissional acessa próprio perfil', async ({ page }) => {
    if (!hasProfessionalFixtures()) {
      test.skip(true, 'E2E_PROFESSIONAL_* ausente')
      return
    }

    await loginAsRole(page, 'PROFESSIONAL')
    await page.goto('/app/perfil')
    await expect(page).not.toHaveURL(/\/login/)
  })

  test('Scenario: recepção lista profissionais sem campos sensíveis na UI', async ({ page }) => {
    if (!hasReceptionFixtures()) {
      test.skip(
        true,
        'E2E_RECEPTION_* ausente — projeção councilNumber/phone coberta por integração',
      )
      return
    }

    // Given: RECEPTION
    await loginAsRole(page, 'RECEPTION')

    // When: lista profissionais
    await page.goto('/app/configuracoes/profissionais')

    // Then: não exibe rótulos/valores típicos de CREFITO/telefone sensível
    // (API já omite; UI não deve inventar)
    const body = await page.getByRole('main').innerText()
    expect(body).not.toMatch(/CREFITO\s+\d{4,}/i)
  })
})
