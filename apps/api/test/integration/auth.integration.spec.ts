import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals'
import { PrismaClient } from '@prisma/client'
import { disconnectFixtures, resetFixtures, type IntegrationFixtures } from './setup/fixtures'
import { createTestApp, type TestApp } from './setup/test-app'

const API_HEADERS = {
  'content-type': 'application/json',
  'x-client': 'api',
}

describe('auth session (integration)', () => {
  let app: TestApp
  let baseUrl: string
  let fixtures: IntegrationFixtures
  const prisma = new PrismaClient()

  async function request(
    method: string,
    path: string,
    options: { body?: unknown; token?: string; headers?: Record<string, string> } = {},
  ): Promise<{ status: number; body: unknown }> {
    const headers: Record<string, string> = { ...API_HEADERS, ...(options.headers ?? {}) }
    if (options.token) {
      headers.authorization = `Bearer ${options.token}`
    }
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
    const text = await response.text()
    let body: unknown = null
    if (text) {
      try {
        body = JSON.parse(text)
      } catch {
        body = text
      }
    }
    return { status: response.status, body }
  }

  beforeAll(async () => {
    process.env.AUTH_SELF_SIGNUP_ENABLED = 'false'
    process.env.AUTH_EXPOSE_RESET_TOKEN = 'false'
    process.env.MAILER_DRIVER = 'test-mailbox'
    app = await createTestApp()
    await app.listen(0)
    const address = app.getHttpServer().address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  beforeEach(async () => {
    fixtures = await resetFixtures()
  })

  afterAll(async () => {
    await app.close()
    await prisma.$disconnect()
    await disconnectFixtures()
  })

  it('logs in owner@a and returns refresh token for X-Client: api', async () => {
    const response = await request('POST', '/auth/login', {
      body: { email: fixtures.ownerA.email, password: fixtures.ownerA.password },
    })
    expect(response.status).toBe(200)
    const body = response.body as {
      accessToken: string
      refreshToken?: string
      tenant: { slug: string }
    }
    expect(body.tenant.slug).toBe('studio-a')
    expect(body.refreshToken).toBeTruthy()
    expect(body.accessToken).toBeTruthy()
  })

  it('locks account after repeated failed logins', async () => {
    for (let i = 0; i < 9; i += 1) {
      const failed = await request('POST', '/auth/login', {
        body: { email: fixtures.ownerA.email, password: 'WrongPassword!!1' },
      })
      expect(failed.status).toBe(401)
    }
    const locked = await request('POST', '/auth/login', {
      body: { email: fixtures.ownerA.email, password: 'WrongPassword!!1' },
    })
    expect(locked.status).toBe(423)
  })

  it('returns 409 when user has multiple memberships and no tenantSlug', async () => {
    const response = await request('POST', '/auth/login', {
      body: { email: fixtures.multiOwner.email, password: fixtures.multiOwner.password },
    })
    expect(response.status).toBe(409)
    const body = response.body as { code: string; tenants: Array<{ slug: string }> }
    expect(body.code).toBe('TENANT_SELECTION_REQUIRED')
    expect(body.tenants.map((item) => item.slug).sort()).toEqual(['studio-a', 'studio-b'])
  })

  it('rotates refresh tokens and revokes family on reuse', async () => {
    const login = await request('POST', '/auth/login', {
      body: { email: fixtures.ownerA.email, password: fixtures.ownerA.password },
    })
    const first = login.body as { refreshToken: string; accessToken: string }
    const rotated = await request('POST', '/auth/refresh', {
      body: { refreshToken: first.refreshToken },
    })
    expect(rotated.status).toBe(200)
    const second = rotated.body as { refreshToken: string }

    const reuse = await request('POST', '/auth/refresh', {
      body: { refreshToken: first.refreshToken },
    })
    expect(reuse.status).toBe(401)

    const secondReuse = await request('POST', '/auth/refresh', {
      body: { refreshToken: second.refreshToken },
    })
    expect(secondReuse.status).toBe(401)

    const family = await prisma.refreshSession.findMany({
      where: { userId: fixtures.ownerA.id },
    })
    expect(family.every((session) => session.revokedAt !== null)).toBe(true)
  })

  it('allows at most one concurrent refresh of the same token', async () => {
    const login = await request('POST', '/auth/login', {
      body: { email: fixtures.ownerA.email, password: fixtures.ownerA.password },
    })
    const session = login.body as { refreshToken: string }
    const [first, second] = await Promise.all([
      request('POST', '/auth/refresh', { body: { refreshToken: session.refreshToken } }),
      request('POST', '/auth/refresh', { body: { refreshToken: session.refreshToken } }),
    ])

    const statuses = [first.status, second.status].sort()
    expect(statuses.filter((status) => status === 200).length).toBeLessThanOrEqual(1)
    expect(statuses).toContain(401)

    const rows = await prisma.refreshSession.findMany({
      where: { userId: fixtures.ownerA.id },
      orderBy: { createdAt: 'asc' },
    })
    expect(rows.length).toBeGreaterThanOrEqual(1)
    const familyIds = new Set(rows.map((row) => row.familyId))
    expect(familyIds.size).toBe(1)

    const active = rows.filter((row) => row.revokedAt === null)
    // Winner may keep one active session; if loser triggered family revoke, zero active.
    expect(active.length).toBeLessThanOrEqual(1)
    if (active.length === 1) {
      const winnerBodies = [first, second].filter((item) => item.status === 200)
      expect(winnerBodies).toHaveLength(1)
      const winner = winnerBodies[0]!.body as { refreshToken: string }
      const stillValid = await request('POST', '/auth/refresh', {
        body: { refreshToken: winner.refreshToken },
      })
      expect(stillValid.status).toBe(200)
    }
  })

  it('signup creates tenant+owner when flag is enabled', async () => {
    const previous = process.env.AUTH_SELF_SIGNUP_ENABLED
    process.env.AUTH_SELF_SIGNUP_ENABLED = 'true'
    try {
      const response = await request('POST', '/auth/signup', {
        body: {
          studioName: 'Studio Novo',
          slug: 'studio-novo',
          ownerName: 'Owner Novo',
          email: 'owner@studio-novo.test',
          password: 'CorrectHorse1Battery!',
        },
      })
      expect(response.status).toBe(201)
      const body = response.body as {
        tenant: { slug: string }
        membership: { role: string }
        refreshToken?: string
      }
      expect(body.tenant.slug).toBe('studio-novo')
      expect(body.membership.role).toBe('OWNER')
      expect(body.refreshToken).toBeTruthy()

      const membership = await prisma.membership.findFirst({
        where: { user: { email: 'owner@studio-novo.test' } },
        include: { tenant: true },
      })
      expect(membership?.role).toBe('OWNER')
      expect(membership?.tenant.slug).toBe('studio-novo')
    } finally {
      process.env.AUTH_SELF_SIGNUP_ENABLED = previous
    }
  })

  it('rejects refresh after logout', async () => {
    const login = await request('POST', '/auth/login', {
      body: { email: fixtures.ownerA.email, password: fixtures.ownerA.password },
    })
    const session = login.body as { refreshToken: string }
    const logout = await request('POST', '/auth/logout', {
      body: { refreshToken: session.refreshToken },
    })
    expect(logout.status).toBe(204)
    const refresh = await request('POST', '/auth/refresh', {
      body: { refreshToken: session.refreshToken },
    })
    expect(refresh.status).toBe(401)
  })

  it('signup is disabled by default', async () => {
    const response = await request('POST', '/auth/signup', {
      body: {
        studioName: 'New Studio',
        slug: 'new-studio',
        ownerName: 'Owner',
        email: 'new-owner@studio.test',
        password: 'CorrectHorse1Battery!',
      },
    })
    expect(response.status).toBe(404)
  })

  it('resets password via mailbox and revokes prior sessions', async () => {
    const login = await request('POST', '/auth/login', {
      body: { email: fixtures.ownerA.email, password: fixtures.ownerA.password },
    })
    const oldSession = login.body as { refreshToken: string; accessToken: string }

    const resetRequest = await request('POST', '/auth/password-reset/request', {
      body: { email: fixtures.ownerA.email },
    })
    expect(resetRequest.status).toBe(202)

    const mailbox = await request('GET', `/__test__/mailbox?to=${encodeURIComponent(fixtures.ownerA.email)}`)
    expect(mailbox.status).toBe(200)
    const messages = mailbox.body as Array<{ text: string }>
    expect(messages.length).toBeGreaterThan(0)
    const match = messages[0]!.text.match(/redefinir-senha\/([A-Za-z0-9_-]+)/)
    expect(match?.[1]).toBeTruthy()
    const token = match![1]!

    const newPassword = 'BrandNewHorse2Battery!'
    const confirm = await request('POST', '/auth/password-reset/confirm', {
      body: { token, password: newPassword },
    })
    expect(confirm.status).toBe(204)

    const oldRefresh = await request('POST', '/auth/refresh', {
      body: { refreshToken: oldSession.refreshToken },
    })
    expect(oldRefresh.status).toBe(401)

    const oldLogin = await request('POST', '/auth/login', {
      body: { email: fixtures.ownerA.email, password: fixtures.ownerA.password },
    })
    expect(oldLogin.status).toBe(401)

    const newLogin = await request('POST', '/auth/login', {
      body: { email: fixtures.ownerA.email, password: newPassword },
    })
    expect(newLogin.status).toBe(200)
  })

  it('switch-tenant rejects tenants without membership', async () => {
    const login = await request('POST', '/auth/login', {
      body: { email: fixtures.ownerA.email, password: fixtures.ownerA.password },
    })
    const session = login.body as { accessToken: string; refreshToken: string }
    const switched = await request('POST', '/auth/switch-tenant', {
      token: session.accessToken,
      body: { tenantId: fixtures.studioB.id },
    })
    expect([403, 404]).toContain(switched.status)

    const stillValid = await request('POST', '/auth/refresh', {
      body: { refreshToken: session.refreshToken },
    })
    expect(stillValid.status).toBe(200)
  })
})
