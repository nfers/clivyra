import { expect, test } from '@playwright/test'
import { hasReceptionFixtures } from '../support/env'
import { loginAsRole } from '../support/auth'

/**
 * Feature: RBAC e convites (CLI-13)
 * Gherkin: tests/e2e/features/cli-13-rbac.feature
 *
 * Matriz deny-by-default, LAST_OWNER e aceite com role no body → integração.
 */
test.describe('Feature: RBAC e convites (CLI-13)', () => {
  test('Scenario: visitante não acessa gestão de usuários', async ({ page }) => {
    // Given: sem sessão
    // When: navega para usuários
    await page.goto('/app/configuracoes/usuarios')

    // Then: redireciona para login
    await expect(page).toHaveURL(/\/login\?next=/)
  })

  test('Scenario: página pública de convite inválido mostra alerta genérico', async ({ page }) => {
    // Given/When: token sintético inválido
    await page.goto('/convite/token-invalido-de-teste-123456')

    // Then: formulário + alerta (sem vazar existência de tenant/e-mail)
    await expect(page.getByRole('heading', { name: 'Aceitar convite' })).toBeVisible()
    await expect(page.getByRole('alert')).toBeVisible()
  })

  test('Scenario: RECEPTION não administra usuários', async ({ page }) => {
    if (!hasReceptionFixtures()) {
      test.skip(
        true,
        'E2E_RECEPTION_* ausente — authz negativa coberta por users.integration.spec.ts',
      )
      return
    }

    // Given: RECEPTION autenticada
    await loginAsRole(page, 'RECEPTION')

    // When: tenta abrir gestão de usuários
    await page.goto('/app/configuracoes/usuarios')

    // Then: acesso negado (UI) — API também responde 403 no backend
    const denied = page.getByText(/acesso negado|sem permissão|forbidden|não autorizado/i)
    await expect(denied).toBeVisible({ timeout: 8_000 })
  })
})
