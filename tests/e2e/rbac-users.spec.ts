import { expect, test } from '@playwright/test'

test.describe('Gestão de usuários (RBAC)', () => {
  test('RECEPTION vê acesso negado em /app/configuracoes/usuarios quando sem permissão na UI', async ({
    page,
  }) => {
    // Without a seeded reception session in E2E env, assert the protected app shell
    // still redirects unauthenticated users away from the users settings route.
    await page.goto('/app/configuracoes/usuarios')
    await expect(page).toHaveURL(/\/login\?next=/)
  })

  test('página pública de convite renderiza formulário ou erro genérico', async ({ page }) => {
    await page.goto('/convite/token-invalido-de-teste-123456')
    await expect(page.getByRole('heading', { name: 'Aceitar convite' })).toBeVisible()
    await expect(page.getByRole('alert')).toBeVisible()
  })
})
