import { expect, test } from '@playwright/test'
import { hasAuthFixtures, hasProfessionalFixtures } from '../support/env'
import { loginAsRole } from '../support/auth'

/**
 * Feature: Trilha de auditoria (CLI-14)
 * Gherkin: tests/e2e/features/cli-14-audit.feature
 *
 * Append-only + sanitizer de secrets → audit.integration.spec.ts.
 */
test.describe('Feature: Trilha de auditoria (CLI-14)', () => {
  test('Scenario: visitante não acessa auditoria', async ({ page }) => {
    // Given/When: sem sessão
    await page.goto('/app/configuracoes/auditoria')

    // Then: login requerido
    await expect(page).toHaveURL(/\/login\?next=/)
  })

  test('Scenario: PROFESSIONAL sem audit:read é bloqueado', async ({ page }) => {
    if (!hasProfessionalFixtures()) {
      test.skip(true, 'E2E_PROFESSIONAL_* ausente — 403 audit:read coberto por integração')
      return
    }

    // Given: PROFESSIONAL autenticada
    await loginAsRole(page, 'PROFESSIONAL')

    // When: abre auditoria
    await page.goto('/app/configuracoes/auditoria')

    // Then: acesso negado
    await expect(page.getByText(/acesso negado|sem permissão|forbidden/i)).toBeVisible({
      timeout: 8_000,
    })
  })

  test('Scenario: OWNER autenticado alcança tela de auditoria', async ({ page }) => {
    if (!hasAuthFixtures()) {
      test.skip(true, 'E2E_OWNER_* ausente')
      return
    }

    // Given: OWNER
    await loginAsRole(page, 'OWNER')

    // When: navega para auditoria
    await page.goto('/app/configuracoes/auditoria')

    // Then: página de auditoria (somente leitura) fica acessível
    await expect(page).not.toHaveURL(/\/login/)
    await expect(
      page.getByRole('heading', { name: /auditoria/i }).or(page.getByText(/auditoria/i)),
    ).toBeVisible({ timeout: 8_000 })
  })
})
