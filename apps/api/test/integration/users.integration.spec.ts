import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals'
import { PrismaClient } from '@prisma/client'
import { disconnectFixtures, resetFixtures, type IntegrationFixtures } from './setup/fixtures'
import { createTestApp, type TestApp } from './setup/test-app'

const API_HEADERS = {
  'content-type': 'application/json',
  'x-client': 'api',
}

describe('users & invitations (integration)', () => {
  let app: TestApp
  let baseUrl: string
  let fixtures: IntegrationFixtures
  const prisma = new PrismaClient()

  async function request(
    method: string,
    path: string,
    options: { body?: unknown; token?: string } = {},
  ): Promise<{ status: number; body: unknown }> {
    const headers: Record<string, string> = { ...API_HEADERS }
    if (options.token) headers.authorization = `Bearer ${options.token}`
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

  async function loginAs(email: string, password: string, tenantSlug?: string) {
    const response = await request('POST', '/auth/login', {
      body: { email, password, ...(tenantSlug ? { tenantSlug } : {}) },
    })
    expect(response.status).toBe(200)
    return response.body as { accessToken: string; refreshToken: string }
  }

  beforeAll(async () => {
    process.env.MAILER_DRIVER = 'test-mailbox'
    process.env.WEB_ORIGIN = 'http://127.0.0.1:3000'
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

  it('denies RECEPTION listing users with 403', async () => {
    // Promote pro to reception for this assertion via direct membership update.
    await prisma.membership.update({
      where: { id: fixtures.proA.membershipId },
      data: { role: 'RECEPTION' },
    })
    const session = await loginAs(fixtures.proA.email, fixtures.proA.password)
    const response = await request('GET', '/users', { token: session.accessToken })
    expect(response.status).toBe(403)
  })

  it('OWNER invites PROFESSIONAL; accept creates user and session', async () => {
    const owner = await loginAs(fixtures.ownerA.email, fixtures.ownerA.password)
    const invite = await request('POST', '/users/invitations', {
      token: owner.accessToken,
      body: { email: 'novo.pro@studio-a.test', role: 'PROFESSIONAL' },
    })
    expect(invite.status).toBe(201)

    const mailbox = await request(
      'GET',
      `/__test__/mailbox?to=${encodeURIComponent('novo.pro@studio-a.test')}`,
    )
    expect(mailbox.status).toBe(200)
    const messages = mailbox.body as Array<{ text: string }>
    const match = messages[0]?.text.match(/\/convite\/([A-Za-z0-9_-]+)/)
    expect(match?.[1]).toBeTruthy()
    const token = match![1]

    const accept = await request('POST', '/auth/invitations/accept', {
      body: {
        token,
        name: 'Novo Pro',
        password: 'CorrectHorse1Battery!',
      },
    })
    expect(accept.status).toBe(201)
    const session = accept.body as {
      accessToken: string
      membership: { role: string }
      tenant: { slug: string }
    }
    expect(session.membership.role).toBe('PROFESSIONAL')
    expect(session.tenant.slug).toBe('studio-a')
  })

  it('ADMIN cannot invite OWNER', async () => {
    await prisma.membership.create({
      data: {
        tenantId: fixtures.studioA.id,
        userId: (
          await prisma.user.create({
            data: {
              email: 'admin@a.test',
              name: 'Admin A',
              passwordHash: (
                await prisma.user.findUniqueOrThrow({ where: { id: fixtures.ownerA.id } })
              ).passwordHash!,
            },
          })
        ).id,
        role: 'ADMIN',
      },
    })
    const admin = await loginAs('admin@a.test', fixtures.ownerA.password)
    const invite = await request('POST', '/users/invitations', {
      token: admin.accessToken,
      body: { email: 'should-fail@a.test', role: 'OWNER' },
    })
    expect(invite.status).toBe(403)
  })

  it('rejects role in accept body (forbidNonWhitelisted)', async () => {
    const owner = await loginAs(fixtures.ownerA.email, fixtures.ownerA.password)
    await request('POST', '/users/invitations', {
      token: owner.accessToken,
      body: { email: 'role.body@a.test', role: 'RECEPTION' },
    })
    const mailbox = await request(
      'GET',
      `/__test__/mailbox?to=${encodeURIComponent('role.body@a.test')}`,
    )
    const messages = mailbox.body as Array<{ text: string }>
    const token = messages[0]?.text.match(/\/convite\/([A-Za-z0-9_-]+)/)?.[1]
    const accept = await request('POST', '/auth/invitations/accept', {
      body: {
        token,
        name: 'Hack',
        password: 'CorrectHorse1Battery!',
        role: 'OWNER',
      },
    })
    expect(accept.status).toBe(400)
  })

  it('existing user accept requires correct password', async () => {
    const owner = await loginAs(fixtures.ownerA.email, fixtures.ownerA.password)
    await request('POST', '/users/invitations', {
      token: owner.accessToken,
      body: { email: fixtures.ownerB.email, role: 'PROFESSIONAL' },
    })
    const mailbox = await request(
      'GET',
      `/__test__/mailbox?to=${encodeURIComponent(fixtures.ownerB.email)}`,
    )
    const messages = mailbox.body as Array<{ text: string }>
    const token = messages[0]?.text.match(/\/convite\/([A-Za-z0-9_-]+)/)?.[1]

    const wrong = await request('POST', '/auth/invitations/accept', {
      body: { token, password: 'WrongPassword!!1' },
    })
    expect(wrong.status).toBe(401)

    const ok = await request('POST', '/auth/invitations/accept', {
      body: { token, password: fixtures.ownerB.password },
    })
    expect(ok.status).toBe(201)
  })

  it('blocks last owner from demoting or deactivating self with LAST_OWNER', async () => {
    // Ensure ownerA is the only OWNER in studio-a (multiOwner is also OWNER there).
    await prisma.membership.update({
      where: { id: fixtures.multiOwner.membershipAId },
      data: { role: 'ADMIN' },
    })
    const owner = await loginAs(fixtures.ownerA.email, fixtures.ownerA.password)
    const demote = await request('PATCH', `/users/${fixtures.ownerA.membershipId}/role`, {
      token: owner.accessToken,
      body: { role: 'ADMIN' },
    })
    expect(demote.status).toBe(409)
    expect((demote.body as { code?: string }).code).toBe('LAST_OWNER')

    const deactivate = await request('POST', `/users/${fixtures.ownerA.membershipId}/deactivate`, {
      token: owner.accessToken,
    })
    expect(deactivate.status).toBe(409)
  })

  it('returns 404 when changing membership of another tenant', async () => {
    const owner = await loginAs(fixtures.ownerA.email, fixtures.ownerA.password)
    const response = await request('PATCH', `/users/${fixtures.ownerB.membershipId}/role`, {
      token: owner.accessToken,
      body: { role: 'ADMIN' },
    })
    expect(response.status).toBe(404)
  })

  it('deactivation revokes tenant sessions; next request is 401', async () => {
    const pro = await loginAs(fixtures.proA.email, fixtures.proA.password)
    const owner = await loginAs(fixtures.ownerA.email, fixtures.ownerA.password)

    const deactivate = await request('POST', `/users/${fixtures.proA.membershipId}/deactivate`, {
      token: owner.accessToken,
    })
    expect(deactivate.status).toBe(204)

    const me = await request('GET', '/auth/me', { token: pro.accessToken })
    // /auth/me is @NoTenant — still works without membership. Probe a tenant route.
    const users = await request('GET', '/auth/permissions', { token: pro.accessToken })
    expect(users.status).toBe(401)

    const refresh = await request('POST', '/auth/refresh', {
      body: { refreshToken: pro.refreshToken },
    })
    expect(refresh.status).toBe(401)
  })

  it('marks expired invitations as EXPIRED with 410', async () => {
    const owner = await loginAs(fixtures.ownerA.email, fixtures.ownerA.password)
    const invite = await request('POST', '/users/invitations', {
      token: owner.accessToken,
      body: { email: 'expired@a.test', role: 'RECEPTION' },
    })
    expect(invite.status).toBe(201)
    const invitationId = (invite.body as { id: string }).id

    const mailbox = await request(
      'GET',
      `/__test__/mailbox?to=${encodeURIComponent('expired@a.test')}`,
    )
    const token = (mailbox.body as Array<{ text: string }>)[0]?.text.match(
      /\/convite\/([A-Za-z0-9_-]+)/,
    )?.[1]

    await prisma.invitation.update({
      where: { id: invitationId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    })

    const preview = await request('GET', `/auth/invitations/${token}`)
    expect(preview.status).toBe(410)
    const row = await prisma.invitation.findUniqueOrThrow({ where: { id: invitationId } })
    expect(row.status).toBe('EXPIRED')
  })
})
