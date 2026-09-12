import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals'
import { PrismaClient } from '@prisma/client'
import { disconnectFixtures, resetFixtures, type IntegrationFixtures } from './setup/fixtures'
import { createTestApp, type TestApp } from './setup/test-app'

const API_HEADERS = {
  'content-type': 'application/json',
  'x-client': 'api',
}

describe('studio setup (integration)', () => {
  let app: TestApp
  let baseUrl: string
  let fixtures: IntegrationFixtures
  const prisma = new PrismaClient()

  async function request(
    method: string,
    path: string,
    options: { body?: unknown; token?: string; form?: FormData } = {},
  ): Promise<{ status: number; body: unknown }> {
    const headers: Record<string, string> = { 'x-client': 'api' }
    if (!options.form) headers['content-type'] = 'application/json'
    if (options.token) headers.authorization = `Bearer ${options.token}`
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: options.form
        ? options.form
        : options.body !== undefined
          ? JSON.stringify(options.body)
          : undefined,
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
    process.env.FILE_STORAGE_DRIVER = 'local'
    process.env.FILE_STORAGE_LOCAL_DIR = '/tmp/clivyra-test-storage'
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

  it('OWNER patches legal fields; ADMIN gets 403 on legal, 200 on operational', async () => {
    const owner = await loginAs(fixtures.ownerA.email, fixtures.ownerA.password)
    const ownerPatch = await request('PATCH', '/tenant/settings', {
      token: owner.accessToken,
      body: {
        displayName: 'Studio A Legal',
        legalName: 'Studio A LTDA',
        documentType: 'CNPJ',
        documentNumber: '11222333000181',
      },
    })
    expect(ownerPatch.status).toBe(200)
    const ownerBody = ownerPatch.body as { documentNumber: string; legalName: string }
    expect(ownerBody.documentNumber).toBe('11222333000181')
    expect(ownerBody.legalName).toBe('Studio A LTDA')

    const audit = await prisma.auditLog.findFirst({
      where: { tenantId: fixtures.studioA.id, action: 'tenant.settings.updated' },
      orderBy: { occurredAt: 'desc' },
    })
    expect(audit).toBeTruthy()
    expect(JSON.stringify(audit?.changes)).not.toContain('11222333000181')

    await prisma.membership.create({
      data: {
        tenantId: fixtures.studioA.id,
        userId: (
          await prisma.user.create({
            data: {
              email: 'admin@a.studio.test',
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
    const admin = await loginAs('admin@a.studio.test', fixtures.ownerA.password)
    const adminLegal = await request('PATCH', '/tenant/settings', {
      token: admin.accessToken,
      body: { legalName: 'Hack', documentType: 'CNPJ', documentNumber: '11222333000181' },
    })
    expect(adminLegal.status).toBe(403)

    const adminOps = await request('PATCH', '/tenant/settings', {
      token: admin.accessToken,
      body: { phone: '11988887777', displayName: 'Studio A Ops' },
    })
    expect(adminOps.status).toBe(200)
  })

  it('RECEPTION lists professionals without sensitive fields', async () => {
    const owner = await loginAs(fixtures.ownerA.email, fixtures.ownerA.password)
    await request('POST', '/professionals', {
      token: owner.accessToken,
      body: {
        displayName: 'Dra Ana',
        councilType: 'CREFITO',
        councilNumber: '000000F',
        councilState: 'SP',
        phone: '11999990000',
        status: 'ACTIVE',
        membershipId: fixtures.proA.membershipId,
      },
    })

    await prisma.membership.update({
      where: { id: fixtures.proA.membershipId },
      data: { role: 'RECEPTION' },
    })
    // unlink so reception role is not on the professional profile path for list projection of self
    await prisma.professional.updateMany({
      where: { membershipId: fixtures.proA.membershipId },
      data: { membershipId: null },
    })

    const reception = await loginAs(fixtures.proA.email, fixtures.proA.password)
    const list = await request('GET', '/professionals', { token: reception.accessToken })
    expect(list.status).toBe(200)
    const rows = list.body as Array<Record<string, unknown>>
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.councilNumber).toBeUndefined()
      expect(row.phone).toBeUndefined()
    }
  })

  it('PROFESSIONAL invite accept creates DRAFT profile', async () => {
    const owner = await loginAs(fixtures.ownerA.email, fixtures.ownerA.password)
    await request('POST', '/users/invitations', {
      token: owner.accessToken,
      body: { email: 'novo.pro2@studio-a.test', role: 'PROFESSIONAL' },
    })
    const mailbox = await request(
      'GET',
      `/__test__/mailbox?to=${encodeURIComponent('novo.pro2@studio-a.test')}`,
    )
    const messages = mailbox.body as Array<{ text: string }>
    const token = messages[0]?.text.match(/\/convite\/([A-Za-z0-9_-]+)/)?.[1]
    expect(token).toBeTruthy()

    const accept = await request('POST', '/auth/invitations/accept', {
      body: { token, name: 'Novo Pro 2', password: 'CorrectHorse1Battery!' },
    })
    expect(accept.status).toBe(201)

    // allow async handler
    let draft = null
    for (let attempt = 0; attempt < 20; attempt += 1) {
      draft = await prisma.professional.findFirst({
        where: { tenantId: fixtures.studioA.id, displayName: 'Novo Pro 2' },
      })
      if (draft) break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    expect(draft?.status).toBe('DRAFT')
    expect(draft?.membershipId).toBeTruthy()
  })

  it('rejects me status mass-assignment and cross-tenant serviceIds', async () => {
    const owner = await loginAs(fixtures.ownerA.email, fixtures.ownerA.password)
    await request('POST', '/professionals', {
      token: owner.accessToken,
      body: {
        displayName: 'Pro Linked',
        councilNotApplicable: true,
        status: 'ACTIVE',
        membershipId: fixtures.proA.membershipId,
      },
    })
    const pro = await loginAs(fixtures.proA.email, fixtures.proA.password)
    const bad = await request('PATCH', '/professionals/me', {
      token: pro.accessToken,
      body: { status: 'ACTIVE' },
    })
    expect(bad.status).toBe(400)

    const foreign = await prisma.service.create({
      data: {
        tenantId: fixtures.studioB.id,
        name: 'Foreign',
        durationMinutes: 30,
      },
    })
    const cross = await request('POST', '/professionals', {
      token: owner.accessToken,
      body: {
        displayName: 'Cross',
        councilNotApplicable: true,
        status: 'ACTIVE',
        serviceIds: [foreign.id],
      },
    })
    expect([400, 404]).toContain(cross.status)
  })

  it('working hours overlap rejected; effective override empties other days', async () => {
    const owner = await loginAs(fixtures.ownerA.email, fixtures.ownerA.password)
    const overlap = await request('PUT', '/working-hours', {
      token: owner.accessToken,
      body: {
        entries: [
          { weekday: 1, startTime: '08:00', endTime: '12:00' },
          { weekday: 1, startTime: '11:00', endTime: '14:00' },
        ],
      },
    })
    expect(overlap.status).toBe(400)

    await request('PUT', '/working-hours', {
      token: owner.accessToken,
      body: {
        entries: [
          { weekday: 1, startTime: '08:00', endTime: '18:00' },
          { weekday: 2, startTime: '08:00', endTime: '18:00' },
        ],
      },
    })

    const created = await request('POST', '/professionals', {
      token: owner.accessToken,
      body: {
        displayName: 'Hours Pro',
        councilNotApplicable: true,
        status: 'ACTIVE',
      },
    })
    const professionalId = (created.body as { id: string }).id

    await request('PUT', `/working-hours/professionals/${professionalId}`, {
      token: owner.accessToken,
      body: {
        entries: [{ weekday: 1, startTime: '09:00', endTime: '12:00' }],
      },
    })

    // 2026-09-15 is a Tuesday (weekday 2)
    const tue = await request(
      'GET',
      `/working-hours/effective?professionalId=${professionalId}&date=2026-09-15`,
      { token: owner.accessToken },
    )
    expect(tue.status).toBe(200)
    const tueBody = tue.body as { source: string; entries: unknown[] }
    expect(tueBody.source).toBe('override')
    expect(tueBody.entries).toEqual([])

    const mon = await request(
      'GET',
      `/working-hours/effective?professionalId=${professionalId}&date=2026-09-14`,
      { token: owner.accessToken },
    )
    const monBody = mon.body as { entries: Array<{ startTime: string }> }
    expect(monBody.entries[0]?.startTime).toBe('09:00')
  })

  it('onboarding complete requires active professional', async () => {
    const owner = await loginAs(fixtures.ownerA.email, fixtures.ownerA.password)
    await request('PATCH', '/tenant/settings', {
      token: owner.accessToken,
      body: { displayName: 'Ready Studio' },
    })
    await request('PUT', '/working-hours', {
      token: owner.accessToken,
      body: { entries: [{ weekday: 1, startTime: '08:00', endTime: '18:00' }] },
    })
    const incomplete = await request('POST', '/tenant/onboarding/complete', {
      token: owner.accessToken,
    })
    expect(incomplete.status).toBe(409)

    await request('POST', '/professionals', {
      token: owner.accessToken,
      body: {
        displayName: 'Owner Pro',
        councilNotApplicable: true,
        status: 'ACTIVE',
        membershipId: fixtures.ownerA.membershipId,
      },
    })
    const complete = await request('POST', '/tenant/onboarding/complete', {
      token: owner.accessToken,
    })
    expect([200, 201]).toContain(complete.status)
  })

  it('rejects duplicate service name case-insensitively', async () => {
    const owner = await loginAs(fixtures.ownerA.email, fixtures.ownerA.password)
    const first = await request('POST', '/services', {
      token: owner.accessToken,
      body: { name: 'Pilates', durationMinutes: 60 },
    })
    expect(first.status).toBe(201)
    const second = await request('POST', '/services', {
      token: owner.accessToken,
      body: { name: 'pilates', durationMinutes: 45 },
    })
    expect(second.status).toBe(409)
  })
})
