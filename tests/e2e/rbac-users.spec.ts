import { expect, test } from '@playwright/test'

/** @deprecated Prefer tests/e2e/domain/rbac-invitations.spec.ts. Kept for regressão. */
test.describe('Gestão de usuários (RBAC)', () => {
  test('RECEPTION vê acesso negado em /app/configuracoes/usuarios quando sem permissão na UI', async ({
    page,
  }) => {
    // Given: sem sessão (fixtures RECEPTION → domain/rbac-invitations.spec.ts)
    // When: acessa gestão de usuários
    await page.goto('/app/configuracoes/usuarios')
    // Then: redireciona para login
    await expect(page).toHaveURL(/\/login\?next=/)
  })

  test('página pública de convite renderiza formulário ou erro genérico', async ({ page }) => {
    // Given/When: token sintético inválido
    await page.goto('/convite/token-invalido-de-teste-123456')
    // Then: formulário + alerta genérico
    await expect(page.getByRole('heading', { name: 'Aceitar convite' })).toBeVisible()
    await expect(page.getByRole('alert')).toBeVisible()
  })
})
