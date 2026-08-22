import { expect, test } from '@playwright/test'

test('exibe a página técnica da PWA', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle(/Clivyra/)
  await expect(page.getByRole('heading', { name: 'Clivyra está operacional' })).toBeVisible()
})
