import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals'
import { PrismaClient } from '@prisma/client'
import { disconnectFixtures, resetFixtures, type IntegrationFixtures } from './setup/fixtures'
import { createTestApp, type TestApp } from './setup/test-app'
import { TEST_PRINCIPAL_HEADER } from '../../src/test-support/test-principal.guard'

describe('tenant isolation (integration)', () => {
  let app: TestApp
  let baseUrl: string
  let fixtures: IntegrationFixtures
  const prisma = new PrismaClient()

  async function request(
    method: string,
    path: string,
    options: {
      principal?: { userId: string; currentTenantId: string }
      body?: unknown
      requestId?: string
    } = {},
  ): Promise<{ status: number; body: unknown; headers: Headers }> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    }
    if (options.principal) {
      headers[TEST_PRINCIPAL_HEADER] = JSON.stringify(options.principal)
    }
    if (options.requestId) {
      headers['x-request-id'] = options.requestId
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
    return { status: response.status, body, headers: response.headers }
  }

  beforeAll(async () => {
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

  it('lists only memberships for studio-a', async () => {
    const response = await request('GET', '/__test__/memberships', {
      principal: { userId: fixtures.ownerA.id, currentTenantId: fixtures.studioA.id },
    })

    expect(response.status).toBe(200)
    const rows = response.body as Array<{ tenantId: string }>
    expect(rows.length).toBeGreaterThanOrEqual(2)
    expect(rows.every((row) => row.tenantId === fixtures.studioA.id)).toBe(true)
    expect(rows.some((row) => row.tenantId === fixtures.studioB.id)).toBe(false)
  })

  it('returns 404 when updating a membership from another tenant', async () => {
    const before = await prisma.membership.findUniqueOrThrow({
      where: { id: fixtures.ownerB.membershipId },
    })

    const response = await request('PATCH', `/__test__/memberships/${fixtures.ownerB.membershipId}`, {
      principal: { userId: fixtures.ownerA.id, currentTenantId: fixtures.studioA.id },
      body: { role: 'ADMIN' },
    })

    expect(response.status).toBe(404)
    const after = await prisma.membership.findUniqueOrThrow({
      where: { id: fixtures.ownerB.membershipId },
    })
    expect(after.role).toBe(before.role)
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime())
  })

  it('returns 404 when deleting a membership from another tenant', async () => {
    const response = await request('DELETE', `/__test__/memberships/${fixtures.ownerB.membershipId}`, {
      principal: { userId: fixtures.ownerA.id, currentTenantId: fixtures.studioA.id },
    })

    expect(response.status).toBe(404)
    const stillThere = await prisma.membership.findUnique({
      where: { id: fixtures.ownerB.membershipId },
    })
    expect(stillThere).not.toBeNull()
  })

  it('rejects create with foreign tenantId in payload', async () => {
    const response = await request('POST', '/__test__/memberships', {
      principal: { userId: fixtures.ownerA.id, currentTenantId: fixtures.studioA.id },
      body: {
        userId: fixtures.proA.id,
        role: 'ADMIN',
        tenantId: fixtures.studioB.id,
      },
    })

    expect(response.status).toBe(400)
    const count = await prisma.membership.count({
      where: { tenantId: fixtures.studioB.id, userId: fixtures.proA.id },
    })
    expect(count).toBe(0)
  })

  it('rejects update with foreign tenantId in payload and leaves row unchanged', async () => {
    const before = await prisma.membership.findUniqueOrThrow({
      where: { id: fixtures.ownerA.membershipId },
    })

    const response = await request('PATCH', `/__test__/memberships/${fixtures.ownerA.membershipId}`, {
      principal: { userId: fixtures.ownerA.id, currentTenantId: fixtures.studioA.id },
      body: { role: 'ADMIN', tenantId: fixtures.studioB.id },
    })

    expect(response.status).toBe(400)
    const after = await prisma.membership.findUniqueOrThrow({
      where: { id: fixtures.ownerA.membershipId },
    })
    expect(after.tenantId).toBe(fixtures.studioA.id)
    expect(after.role).toBe(before.role)
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime())
  })

  it('returns 401 without principal on protected route', async () => {
    const response = await request('GET', '/__test__/memberships')
    expect(response.status).toBe(401)
  })

  it('returns 401 for inactive membership', async () => {
    await prisma.membership.update({
      where: { id: fixtures.ownerA.membershipId },
      data: { isActive: false },
    })

    const response = await request('GET', '/__test__/memberships', {
      principal: { userId: fixtures.ownerA.id, currentTenantId: fixtures.studioA.id },
    })
    expect(response.status).toBe(401)
  })

  it('keeps tenant isolation across 50 parallel alternating requests', async () => {
    const tasks = Array.from({ length: 50 }, (_, index) => {
      const useA = index % 2 === 0
      return request('GET', '/__test__/memberships', {
        principal: useA
          ? { userId: fixtures.ownerA.id, currentTenantId: fixtures.studioA.id }
          : { userId: fixtures.ownerB.id, currentTenantId: fixtures.studioB.id },
      }).then((response) => ({ useA, response }))
    })

    const results = await Promise.all(tasks)
    for (const { useA, response } of results) {
      expect(response.status).toBe(200)
      const rows = response.body as Array<{ tenantId: string }>
      const expected = useA ? fixtures.studioA.id : fixtures.studioB.id
      expect(rows.every((row) => row.tenantId === expected)).toBe(true)
    }
  })

  it('does not mix tenants when parallel requests share the same client X-Request-Id', async () => {
    const sharedClientRequestId = 'shared-client-request-id-01'
    const tasks = Array.from({ length: 40 }, (_, index) => {
      const useA = index % 2 === 0
      return request('GET', '/__test__/memberships', {
        requestId: sharedClientRequestId,
        principal: useA
          ? { userId: fixtures.ownerA.id, currentTenantId: fixtures.studioA.id }
          : { userId: fixtures.ownerB.id, currentTenantId: fixtures.studioB.id },
      }).then((response) => ({ useA, response }))
    })

    const results = await Promise.all(tasks)
    for (const { useA, response } of results) {
      expect(response.status).toBe(200)
      expect(response.headers.get('x-request-id')).toBe(sharedClientRequestId)
      const rows = response.body as Array<{ tenantId: string }>
      const expected = useA ? fixtures.studioA.id : fixtures.studioB.id
      expect(rows.every((row) => row.tenantId === expected)).toBe(true)
    }
  })

  it('returns 200 for GET /health/ready when database is up', async () => {
    const response = await request('GET', '/health/ready')
    expect(response.status).toBe(200)
    expect(response.headers.get('x-request-id')).toBeTruthy()
  })
})
