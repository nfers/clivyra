import { expect, test } from '@playwright/test'

test('exibe a página técnica da PWA', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle(/Clivyra/)
  await expect(page.getByRole('heading', { name: 'Clivyra está operacional' })).toBeVisible()
})

test('API /health devolve X-Request-Id quando a API está acessível', async ({ request }) => {
  const apiBase = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001'

  let response
  try {
    response = await request.get(`${apiBase}/health`, { timeout: 3_000 })
  } catch {
    test.skip(true, 'API not reachable in this environment')
    return
  }

  expect(response.ok()).toBeTruthy()
  const requestId = response.headers()['x-request-id']
  expect(requestId).toMatch(/^[A-Za-z0-9._-]{8,128}$/)
})
