import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals'
import { PrismaClient } from '@prisma/client'
import { disconnectFixtures, resetFixtures, type IntegrationFixtures } from './setup/fixtures'
import { createTestApp, type TestApp } from './setup/test-app'

const API_HEADERS = {
  'content-type': 'application/json',
  'x-client': 'api',
}

describe('lgpd requests (integration)', () => {
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

  async function loginAs(email: string, password: string) {
    const response = await request('POST', '/auth/login', {
      body: { email, password },
    })
    expect(response.status).toBe(200)
    return response.body as { accessToken: string }
  }

  beforeAll(async () => {
    process.env.MAILER_DRIVER = 'test-mailbox'
    process.env.WEB_ORIGIN = 'http://127.0.0.1:3000'
    process.env.AUDIT_IP_HASH_SALT = process.env.AUDIT_IP_HASH_SALT ?? 'local-dev-audit-ip-hash-salt'
    process.env.LGPD_REQUEST_SLA_DAYS = '15'
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

  it('opens EXPORT with dueAt +15d and executes user export sections', async () => {
    const owner = await loginAs(fixtures.ownerA.email, fixtures.ownerA.password)
    const opened = await request('POST', '/lgpd/requests', {
      token: owner.accessToken,
      body: {
        subjectType: 'USER',
        subjectId: fixtures.proA.id,
        type: 'EXPORT',
        channel: 'IN_PERSON',
      },
    })
    expect(opened.status).toBe(201)
    const view = opened.body as { id: string; dueAt: string; requestedAt: string }
    const due = new Date(view.dueAt).getTime()
    const requested = new Date(view.requestedAt).getTime()
    expect(Math.round((due - requested) / 86_400_000)).toBe(15)

    const executed = await request('POST', `/lgpd/requests/${view.id}/execute`, {
      token: owner.accessToken,
    })
    expect(executed.status).toBe(200)
    const payload = executed.body as {
      exportPayload: { sections: Array<{ section: string; data: unknown }> }
    }
    const names = payload.exportPayload.sections.map((s) => s.section)
    expect(names).toEqual(expect.arrayContaining(['profile', 'memberships', 'consents', 'audit']))

    const blob = JSON.stringify(payload)
    expect(blob).not.toContain(fixtures.ownerB.email)
    expect(blob).not.toContain(fixtures.studioB.id)

    const audit = await prisma.auditLog.findMany({
      where: {
        tenantId: fixtures.studioA.id,
        action: { in: ['lgpd.request.opened', 'lgpd.data.exported'] },
      },
    })
    expect(audit.length).toBeGreaterThanOrEqual(2)
  })

  it('ERASURE retains user with active membership', async () => {
    const owner = await loginAs(fixtures.ownerA.email, fixtures.ownerA.password)
    const opened = await request('POST', '/lgpd/requests', {
      token: owner.accessToken,
      body: {
        subjectType: 'USER',
        subjectId: fixtures.proA.id,
        type: 'ERASURE',
        channel: 'IN_PERSON',
      },
    })
    const id = (opened.body as { id: string }).id
    const executed = await request('POST', `/lgpd/requests/${id}/execute`, {
      token: owner.accessToken,
    })
    expect(executed.status).toBe(200)
    const summary = (executed.body as { erasureSummary: Array<{ strategy: string }> }).erasureSummary
    expect(summary.some((s) => s.strategy === 'RETAINED')).toBe(true)

    const user = await prisma.user.findUnique({ where: { id: fixtures.proA.id } })
    expect(user?.email).toBe('pro@a.test')
    expect(user?.name).toBe('Pro A')
  })

  it('ERASURE anonymizes deactivated user and keeps AuditLog', async () => {
    await prisma.membership.update({
      where: { id: fixtures.proA.membershipId },
      data: { isActive: false, deactivatedAt: new Date() },
    })

    const owner = await loginAs(fixtures.ownerA.email, fixtures.ownerA.password)
    // Ensure an audit row exists for the actor before erasure target
    await request('PATCH', `/users/${fixtures.receptionA.membershipId}/role`, {
      token: owner.accessToken,
      body: { role: 'RECEPTION' },
    })

    const opened = await request('POST', '/lgpd/requests', {
      token: owner.accessToken,
      body: {
        subjectType: 'USER',
        subjectId: fixtures.proA.id,
        type: 'ERASURE',
        channel: 'IN_PERSON',
      },
    })
    const id = (opened.body as { id: string }).id
    const executed = await request('POST', `/lgpd/requests/${id}/execute`, {
      token: owner.accessToken,
    })
    expect(executed.status).toBe(200)

    const user = await prisma.user.findUnique({ where: { id: fixtures.proA.id } })
    expect(user?.name).toBe('Usuário removido')
    expect(user?.email).toContain('anon.clivyra.local')
    expect(user?.passwordHash).toBeNull()

    const login = await request('POST', '/auth/login', {
      body: { email: 'pro@a.test', password: fixtures.proA.password },
    })
    expect(login.status).not.toBe(200)

    const auditCount = await prisma.auditLog.count({
      where: { tenantId: fixtures.studioA.id },
    })
    expect(auditCount).toBeGreaterThan(0)
  })

  it('returns 404 for request from another tenant', async () => {
    const ownerA = await loginAs(fixtures.ownerA.email, fixtures.ownerA.password)
    const opened = await request('POST', '/lgpd/requests', {
      token: ownerA.accessToken,
      body: {
        subjectType: 'USER',
        subjectId: fixtures.proA.id,
        type: 'ACCESS',
        channel: 'IN_PERSON',
      },
    })
    const id = (opened.body as { id: string }).id
    const ownerB = await loginAs(fixtures.ownerB.email, fixtures.ownerB.password)
    const get = await request('GET', `/lgpd/requests/${id}`, { token: ownerB.accessToken })
    expect(get.status).toBe(404)
  })
})
