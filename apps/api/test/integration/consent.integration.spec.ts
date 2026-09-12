import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals'
import { PrismaClient } from '@prisma/client'
import { disconnectFixtures, resetFixtures, type IntegrationFixtures } from './setup/fixtures'
import { createTestApp, type TestApp } from './setup/test-app'

const API_HEADERS = {
  'content-type': 'application/json',
  'x-client': 'api',
}

describe('consent (integration)', () => {
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

  async function publishTerm(token: string, content = 'Termo v1') {
    const draft = await request('POST', '/consent-terms', {
      token,
      body: {
        type: 'DATA_PROCESSING',
        title: 'Termo de tratamento',
        content,
        purposes: ['atendimento'],
      },
    })
    expect(draft.status).toBe(201)
    const id = (draft.body as { id: string }).id
    const published = await request('POST', `/consent-terms/${id}/publish`, {
      token,
      body: {},
    })
    expect(published.status).toBe(200)
    return published.body as { id: string; version: number; contentHash: string; status: string }
  }

  it('publishes incremental versions and retires previous', async () => {
    const owner = await loginAs(fixtures.ownerA.email, fixtures.ownerA.password)
    const v1 = await publishTerm(owner.accessToken, 'conteudo um')
    expect(v1.version).toBe(1)
    expect(v1.status).toBe('PUBLISHED')

    const draft2 = await request('POST', '/consent-terms', {
      token: owner.accessToken,
      body: {
        type: 'DATA_PROCESSING',
        title: 'Termo v2',
        content: 'conteudo dois distinto',
        purposes: ['atendimento'],
      },
    })
    const v2 = await request('POST', `/consent-terms/${(draft2.body as { id: string }).id}/publish`, {
      token: owner.accessToken,
      body: { requiresReconsent: true },
    })
    expect(v2.status).toBe(200)
    expect((v2.body as { version: number }).version).toBe(2)
    expect((v2.body as { contentHash: string }).contentHash).not.toBe(v1.contentHash)

    const retired = await prisma.consentTerm.findUnique({ where: { id: v1.id } })
    expect(retired?.status).toBe('RETIRED')
  })

  it('rejects PATCH on PUBLISHED term with 409', async () => {
    const owner = await loginAs(fixtures.ownerA.email, fixtures.ownerA.password)
    const term = await publishTerm(owner.accessToken)
    const patch = await request('PATCH', `/consent-terms/${term.id}`, {
      token: owner.accessToken,
      body: { title: 'hack' },
    })
    expect(patch.status).toBe(409)
  })

  it('grants IN_PERSON consent with audit and collectedByUserId', async () => {
    const owner = await loginAs(fixtures.ownerA.email, fixtures.ownerA.password)
    const term = await publishTerm(owner.accessToken)
    const grant = await request('POST', '/consents', {
      token: owner.accessToken,
      body: {
        subjectType: 'USER',
        subjectId: fixtures.proA.id,
        termId: term.id,
        source: 'IN_PERSON',
        evidence: { signerName: 'Paciente Teste' },
      },
    })
    expect(grant.status).toBe(201)
    const body = grant.body as { id: string; collectedByUserId: string }
    expect(body.collectedByUserId).toBe(fixtures.ownerA.id)

    const logs = await prisma.auditLog.findMany({
      where: { tenantId: fixtures.studioA.id, action: 'consent.granted' },
    })
    expect(logs.length).toBeGreaterThanOrEqual(1)
  })

  it('revoke creates REVOKED superseding record without mutating original', async () => {
    const owner = await loginAs(fixtures.ownerA.email, fixtures.ownerA.password)
    const term = await publishTerm(owner.accessToken)
    const grant = await request('POST', '/consents', {
      token: owner.accessToken,
      body: {
        subjectType: 'USER',
        subjectId: fixtures.proA.id,
        termId: term.id,
        source: 'IN_PERSON',
        evidence: { signerName: 'Pro A' },
      },
    })
    const grantId = (grant.body as { id: string }).id
    const revoke = await request('POST', `/consents/${grantId}/revoke`, {
      token: owner.accessToken,
      body: { reason: 'pedido do titular' },
    })
    expect(revoke.status).toBe(201)
    const revoked = revoke.body as { status: string; supersedesId: string }
    expect(revoked.status).toBe('REVOKED')
    expect(revoked.supersedesId).toBe(grantId)

    const original = await prisma.consentRecord.findUnique({ where: { id: grantId } })
    expect(original?.status).toBe('GRANTED')
    expect(original?.revokedAt).toBeNull()

    const status = await request(
      'GET',
      `/consents/status?subjectType=USER&subjectId=${fixtures.proA.id}`,
      { token: owner.accessToken },
    )
    expect(status.status).toBe(200)
    expect((status.body as { DATA_PROCESSING: { status: string } }).DATA_PROCESSING.status).toBe(
      'REVOKED',
    )
  })

  it('rejects UPDATE/DELETE on ConsentRecord via SQL', async () => {
    const owner = await loginAs(fixtures.ownerA.email, fixtures.ownerA.password)
    const term = await publishTerm(owner.accessToken)
    const grant = await request('POST', '/consents', {
      token: owner.accessToken,
      body: {
        subjectType: 'USER',
        subjectId: fixtures.proA.id,
        termId: term.id,
        source: 'IN_PERSON',
        evidence: { signerName: 'Pro A' },
      },
    })
    const id = (grant.body as { id: string }).id

    await expect(
      prisma.$executeRawUnsafe(`UPDATE "ConsentRecord" SET "notes" = 'x' WHERE id = '${id}'`),
    ).rejects.toThrow()
    await expect(
      prisma.$executeRawUnsafe(`DELETE FROM "ConsentRecord" WHERE id = '${id}'`),
    ).rejects.toThrow()
  })

  it('returns 404 for termId from another tenant', async () => {
    const ownerB = await loginAs(fixtures.ownerB.email, fixtures.ownerB.password)
    const termB = await publishTerm(ownerB.accessToken)
    const ownerA = await loginAs(fixtures.ownerA.email, fixtures.ownerA.password)
    const grant = await request('POST', '/consents', {
      token: ownerA.accessToken,
      body: {
        subjectType: 'USER',
        subjectId: fixtures.proA.id,
        termId: termB.id,
        source: 'IN_PERSON',
        evidence: { signerName: 'Pro A' },
      },
    })
    expect(grant.status).toBe(404)
  })

  it('marks NEEDS_RENEWAL after publish with requiresReconsent', async () => {
    const owner = await loginAs(fixtures.ownerA.email, fixtures.ownerA.password)
    const v1 = await publishTerm(owner.accessToken, 'v1')
    await request('POST', '/consents', {
      token: owner.accessToken,
      body: {
        subjectType: 'USER',
        subjectId: fixtures.proA.id,
        termId: v1.id,
        source: 'IN_PERSON',
        evidence: { signerName: 'Pro A' },
      },
    })
    const draft2 = await request('POST', '/consent-terms', {
      token: owner.accessToken,
      body: {
        type: 'DATA_PROCESSING',
        title: 'v2',
        content: 'novo texto',
        purposes: ['atendimento'],
      },
    })
    await request('POST', `/consent-terms/${(draft2.body as { id: string }).id}/publish`, {
      token: owner.accessToken,
      body: { requiresReconsent: true },
    })
    const status = await request(
      'GET',
      `/consents/status?subjectType=USER&subjectId=${fixtures.proA.id}`,
      { token: owner.accessToken },
    )
    expect(
      (status.body as { DATA_PROCESSING: { status: string } }).DATA_PROCESSING.status,
    ).toBe('NEEDS_RENEWAL')
  })

  it('allows RECEPTION to grant but denies ERASURE open', async () => {
    const owner = await loginAs(fixtures.ownerA.email, fixtures.ownerA.password)
    const term = await publishTerm(owner.accessToken)
    const recep = await loginAs(fixtures.receptionA.email, fixtures.receptionA.password)
    const grant = await request('POST', '/consents', {
      token: recep.accessToken,
      body: {
        subjectType: 'USER',
        subjectId: fixtures.proA.id,
        termId: term.id,
        source: 'IN_PERSON',
        evidence: { signerName: 'Pro A' },
      },
    })
    expect(grant.status).toBe(201)

    const erasure = await request('POST', '/lgpd/requests', {
      token: recep.accessToken,
      body: {
        subjectType: 'USER',
        subjectId: fixtures.proA.id,
        type: 'ERASURE',
        channel: 'IN_PERSON',
      },
    })
    expect(erasure.status).toBe(403)
  })
})
