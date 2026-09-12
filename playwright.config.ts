import { defineConfig, devices } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** Load `.env.e2e` into process.env without overriding explicit exports. */
function loadE2eEnv(): void {
  const path = resolve(__dirname, '.env.e2e')
  if (!existsSync(path)) return
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i <= 0) continue
    const key = line.slice(0, i).trim()
    const value = line.slice(i + 1).trim()
    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

loadE2eEnv()

// Host-only cookies for 127.0.0.1 baseURL
delete process.env.AUTH_COOKIE_DOMAIN

const apiBase = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001'
const webBase = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3000'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: webBase,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'bash scripts/e2e/start-api.sh',
      url: `${apiBase}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: 'bash scripts/e2e/start-web.sh',
      url: webBase,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
})
