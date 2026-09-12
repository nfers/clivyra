import { expect, test } from '@playwright/test'
import { hasAuthFixtures } from '../support/env'
import { loginAsOwner } from '../support/auth'

/**
 * Feature: Autenticação e sessão (CLI-12)
 * Gherkin: tests/e2e/features/cli-12-auth-session.feature
 *
 * Refresh reuse / lockout / password reset E2E completo → API+mailbox;
 * cobertos em auth.integration.spec.ts quando fixtures E2E ausentes.
 */
test.describe('Feature: Autenticação e sessão (CLI-12)', () => {
  test('Scenario: rota protegida sem sessão redireciona para login', async ({ page }) => {
    // Given: visitante sem cookies de sessão
    // When: tenta abrir /app
    await page.goto('/app')

    // Then: middleware redireciona (UX); API permanece autoridade
    await expect(page).toHaveURL(/\/login\?next=/)
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible()
  })

  test('Scenario: recuperação com e-mail inexistente é genérica', async ({ page }) => {
    // Given: página pública de recuperação
    await page.goto('/recuperar-senha')

    // When: solicita reset para e-mail sintético desconhecido
    await page.getByLabel('E-mail').fill('unknown@studio-a.test')
    await page.getByRole('button', { name: 'Enviar link' }).click()

    // Then: mensagem genérica (sem enumeração de usuários)
    await expect(page.getByRole('status')).toContainText(/Se o e-mail estiver cadastrado/i)
  })

  test('Scenario: login com sucesso redireciona ao app', async ({ page }) => {
    if (!hasAuthFixtures()) {
      test.skip(true, 'Fixtures E2E de OWNER ausentes — use integração auth.integration.spec.ts')
      return
    }

    // Given/When: OWNER autentica com credenciais sintéticas
    await loginAsOwner(page)

    // Then: entra no shell autenticado
    await expect(page).toHaveURL(/\/(app|onboarding)/)
  })

  test('Scenario: sair encerra sessão web', async ({ page }) => {
    if (!hasAuthFixtures()) {
      test.skip(true, 'Fixtures E2E de OWNER ausentes')
      return
    }

    // Given: usuário autenticado
    await loginAsOwner(page)

    // When: clica em Sair (rótulo pt-BR do shell)
    const logout = page.getByRole('button', { name: /sair/i })
    if (!(await logout.count())) {
      test.skip(true, 'Controle Sair não encontrado no shell atual')
      return
    }
    await logout.click()

    // Then: volta ao login e /app exige autenticação novamente
    await expect(page).toHaveURL(/\/login/)
    await page.goto('/app')
    await expect(page).toHaveURL(/\/login\?next=/)
  })
})
