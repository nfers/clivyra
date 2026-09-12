import { expect, test } from '@playwright/test'

test.describe('Login e sessão', () => {
  test('rota protegida sem sessão redireciona para login', async ({ page }) => {
    await page.goto('/app')
    await expect(page).toHaveURL(/\/login\?next=/)
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible()
  })

  test('página de recuperação mostra confirmação genérica', async ({ page }) => {
    await page.goto('/recuperar-senha')
    await page.getByLabel('E-mail').fill('unknown@studio-a.test')
    await page.getByRole('button', { name: 'Enviar link' }).click()
    await expect(page.getByRole('status')).toContainText(/Se o e-mail estiver cadastrado/i)
  })
})
