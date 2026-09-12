import { expect, test } from '@playwright/test'

/** @deprecated Prefer tests/e2e/domain/auth-session.spec.ts (Given/When/Then). Kept for regressão. */
test.describe('Login e sessão', () => {
  test('rota protegida sem sessão redireciona para login', async ({ page }) => {
    // Given: visitante sem sessão
    // When: acessa /app
    await page.goto('/app')
    // Then: redireciona para login
    await expect(page).toHaveURL(/\/login\?next=/)
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible()
  })

  test('página de recuperação mostra confirmação genérica', async ({ page }) => {
    // Given: página de recuperação
    await page.goto('/recuperar-senha')
    // When: e-mail sintético desconhecido
    await page.getByLabel('E-mail').fill('unknown@studio-a.test')
    await page.getByRole('button', { name: 'Enviar link' }).click()
    // Then: mensagem genérica (anti-enumeração)
    await expect(page.getByRole('status')).toContainText(/Se o e-mail estiver cadastrado/i)
  })
})
