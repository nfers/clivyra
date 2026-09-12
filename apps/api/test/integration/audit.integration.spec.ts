import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals'
import { PrismaClient } from '@prisma/client'
import { disconnectFixtures, resetFixtures, type IntegrationFixtures } from './setup/fixtures'
import { createTestApp, type TestApp } from './setup/test-app'

const API_HEADERS = {
  'content-type': 'application/json',
  'x-client': 'api',
}

describe('audit trail (integration)', () => {
  let app: TestApp
  let baseUrl: string
  let fixtures: IntegrationFixtures
  const prisma = new PrismaClient()

  async function request(
    method: string,
    path: string,
    options: { body?: unknown; token?: string; headers?: Record<string, string> } = {},
  ): Promise<{ status: number; body: unknown; headers: Headers }> {
    const headers: Record<string, string> = { ...API_HEADERS, ...(options.headers ?? {}) }
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
    return { status: response.status, body, headers: response.headers }
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
    process.env.AUDIT_IP_HASH_SALT = process.env.AUDIT_IP_HASH_SALT ?? 'local-dev-audit-ip-hash-salt'
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

  it('records users.role.changed with changes when OWNER updates a role', async () => {
    const owner = await loginAs(fixtures.ownerA.email, fixtures.ownerA.password)
    const response = await request('PATCH', `/users/${fixtures.proA.membershipId}/role`, {
      token: owner.accessToken,
      body: { role: 'ADMIN' },
      headers: { 'x-request-id': 'req-role-change-1' },
    })
    expect(response.status).toBe(200)

    // Allow async adapter paths to settle (role change itself is transactional).
    await new Promise((resolve) => setTimeout(resolve, 50))

    const logs = await prisma.auditLog.findMany({
      where: { tenantId: fixtures.studioA.id, action: 'users.role.changed' },
    })
    expect(logs).toHaveLength(1)
    expect(logs[0]!.actorUserId).toBe(fixtures.ownerA.id)
    expect(logs[0]!.requestId).toBe('req-role-change-1')
    expect(logs[0]!.changes).toEqual([
      { field: 'role', from: 'PROFESSIONAL', to: 'ADMIN' },
    ])
  })

  it('login and password reset do not store secrets in audit metadata', async () => {
    const password = fixtures.ownerA.password
    await loginAs(fixtures.ownerA.email, password)

    const reset = await request('POST', '/auth/password-reset/request', {
      body: { email: fixtures.ownerA.email },
    })
    expect(reset.status).toBe(202)

    await new Promise((resolve) => setTimeout(resolve, 50))

    const rows = await prisma.auditLog.findMany({
      where: {
        tenantId: fixtures.studioA.id,
        action: { in: ['auth.login.succeeded', 'auth.password.reset_requested'] },
      },
    })
    expect(rows.length).toBeGreaterThanOrEqual(1)
    for (const row of rows) {
      const blob = JSON.stringify({ metadata: row.metadata, changes: row.changes })
      expect(blob).not.toContain(password)
      expect(blob.toLowerCase()).not.toMatch(/"(password|token|refreshtoken|accesstoken)"\s*:/)
    }
  })

  it('rejects UPDATE/DELETE via SQL with restrict_violation', async () => {
    const owner = await loginAs(fixtures.ownerA.email, fixtures.ownerA.password)
    await request('PATCH', `/users/${fixtures.proA.membershipId}/role`, {
      token: owner.accessToken,
      body: { role: 'RECEPTION' },
    })
    const row = await prisma.auditLog.findFirst({
      where: { tenantId: fixtures.studioA.id },
    })
    expect(row).toBeTruthy()

    await expect(
      prisma.$executeRawUnsafe(`UPDATE "AuditLog" SET "action" = 'tampered' WHERE id = '${row!.id}'`),
    ).rejects.toThrow(/append-only|restrict_violation/i)

    await expect(
      prisma.$executeRawUnsafe(`DELETE FROM "AuditLog" WHERE id = '${row!.id}'`),
    ).rejects.toThrow(/append-only|restrict_violation/i)
  })

  it('prisma.auditLog.update throws AuditImmutableError', async () => {
    const { createTenantScopedExtension } = await import('../../src/prisma/tenant-scoped.extension')
    const { AuditImmutableError } = await import('../../src/audit/audit.errors')
    const scoped = new PrismaClient().$extends(createTenantScopedExtension())
    await scoped.$connect()
    try {
      await expect(
        scoped.bypassTenant('audit-test', () =>
          scoped.auditLog.update({
            where: { id: 'missing' },
            data: { action: 'x' },
          }),
        ),
      ).rejects.toBeInstanceOf(AuditImmutableError)
    } finally {
      await scoped.$disconnect()
    }
  })

  it('GET /audit-logs is tenant-scoped; cross-tenant id is 404', async () => {
    const ownerA = await loginAs(fixtures.ownerA.email, fixtures.ownerA.password)
    const ownerB = await loginAs(fixtures.ownerB.email, fixtures.ownerB.password)

    await request('PATCH', `/users/${fixtures.proA.membershipId}/role`, {
      token: ownerA.accessToken,
      body: { role: 'ADMIN' },
    })

    const listA = await request('GET', '/audit-logs?action=users.role.changed', {
      token: ownerA.accessToken,
    })
    expect(listA.status).toBe(200)
    const payloadA = listA.body as { items: Array<{ id: string; action: string }> }
    expect(payloadA.items.every((item) => item.action === 'users.role.changed')).toBe(true)
    expect(payloadA.items.length).toBeGreaterThanOrEqual(1)
    const idA = payloadA.items[0]!.id

    const listB = await request('GET', '/audit-logs?action=users.role.changed', {
      token: ownerB.accessToken,
    })
    expect(listB.status).toBe(200)
    const payloadB = listB.body as { items: unknown[] }
    expect(payloadB.items).toHaveLength(0)

    const cross = await request('GET', `/audit-logs/${idA}`, { token: ownerB.accessToken })
    expect(cross.status).toBe(404)

    // Response must not leak ipHash/userAgent
    const detail = await request('GET', `/audit-logs/${idA}`, { token: ownerA.accessToken })
    expect(detail.status).toBe(200)
    const body = JSON.stringify(detail.body)
    expect(body).not.toContain('ipHash')
    expect(body).not.toContain('userAgent')
  })

  it('denies RECEPTION with 403', async () => {
    await prisma.membership.update({
      where: { id: fixtures.proA.membershipId },
      data: { role: 'RECEPTION' },
    })
    const session = await loginAs(fixtures.proA.email, fixtures.proA.password)
    const response = await request('GET', '/audit-logs', { token: session.accessToken })
    expect(response.status).toBe(403)
  })

  it('rejects windows larger than 90 days', async () => {
    const owner = await loginAs(fixtures.ownerA.email, fixtures.ownerA.password)
    const to = new Date()
    const from = new Date(to.getTime() - 100 * 24 * 60 * 60 * 1000)
    const response = await request(
      'GET',
      `/audit-logs?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
      { token: owner.accessToken },
    )
    expect(response.status).toBe(400)
  })

  it('rolls back membership change when audit write fails inside the transaction', async () => {
    const owner = await loginAs(fixtures.ownerA.email, fixtures.ownerA.password)

    // Force audit create to fail by temporarily swapping the DB function? Use a mock via
    // invalid tenant FK instead: call UsersService path with a sabotaged audit by
    // deleting the tenant mid-flight is too heavy. Instead, use a transaction that
    // records against a non-existent tenantId through a direct service call.
    const { AuditService } = await import('../../src/audit/audit.service')
    const { PrismaService } = await import('../../src/prisma/prisma.service')
    const prismaService = app.get(PrismaService)
    const audit = app.get(AuditService)

    const before = await prisma.membership.findUniqueOrThrow({
      where: { id: fixtures.proA.membershipId },
    })

    await expect(
      prismaService.$transaction(async (tx) => {
        await tx.membership.updateMany({
          where: { id: fixtures.proA.membershipId, tenantId: fixtures.studioA.id },
          data: { role: 'ADMIN' },
        })
        await audit.record(
          {
            action: 'users.role.changed',
            entityType: 'Membership',
            entityId: fixtures.proA.membershipId,
            metadata: { membershipId: fixtures.proA.membershipId },
            tenantId: 'missing-tenant-id-for-rollback',
          },
          tx,
        )
      }),
    ).rejects.toThrow()

    const after = await prisma.membership.findUniqueOrThrow({
      where: { id: fixtures.proA.membershipId },
    })
    expect(after.role).toBe(before.role)

    // silence unused
    expect(owner.accessToken).toBeTruthy()
  })

  it('recordAccess failure does not fail the caller', async () => {
    const { AuditService } = await import('../../src/audit/audit.service')
    const { PrismaService } = await import('../../src/prisma/prisma.service')
    const audit = app.get(AuditService)
    const prismaService = app.get(PrismaService)
    const originalCreate = prismaService.auditLog.create
    ;(prismaService.auditLog as { create: typeof originalCreate }).create = (async () => {
      throw new Error('boom')
    }) as unknown as typeof originalCreate
    await expect(
      audit.recordAccess({
        action: 'audit.queried',
        entityType: 'AuditLog',
        tenantId: fixtures.studioA.id,
        actor: { type: 'SYSTEM', reason: 'test' },
        metadata: { route: '/x', method: 'GET' },
      }),
    ).resolves.toBeUndefined()
    prismaService.auditLog.create = originalCreate
  })

  it('records auth.refresh.reuse_detected as DENIED', async () => {
    const session = await loginAs(fixtures.ownerA.email, fixtures.ownerA.password)
    // Rotate once
    const rotated = await request('POST', '/auth/refresh', {
      body: { refreshToken: session.refreshToken },
    })
    expect(rotated.status).toBe(200)
    // Reuse old refresh
    const reuse = await request('POST', '/auth/refresh', {
      body: { refreshToken: session.refreshToken },
    })
    expect(reuse.status).toBe(401)

    await new Promise((resolve) => setTimeout(resolve, 50))
    const logs = await prisma.auditLog.findMany({
      where: { tenantId: fixtures.studioA.id, action: 'auth.refresh.reuse_detected' },
    })
    expect(logs.length).toBeGreaterThanOrEqual(1)
    expect(logs[0]!.outcome).toBe('DENIED')
  })
})
