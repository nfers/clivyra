import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals'
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants'
import { RequestMethod } from '@nestjs/common'
import { ModulesContainer } from '@nestjs/core'
import { IS_PUBLIC_KEY } from '../../src/auth/public.decorator'
import { IS_NO_TENANT_KEY } from '../../src/tenant/no-tenant.decorator'
import {
  REQUIRED_ANY_PERMISSION_METADATA_KEY,
  REQUIRED_PERMISSIONS_METADATA_KEY,
} from '../../src/rbac/permissions.decorator'
import { createTestApp, type TestApp } from './setup/test-app'
import { disconnectFixtures, resetFixtures, type IntegrationFixtures } from './setup/fixtures'

const METHOD_NAME: Record<number, string> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.PATCH]: 'PATCH',
  [RequestMethod.DELETE]: 'DELETE',
}

const NO_TENANT_ALLOWLIST = new Set([
  'POST /auth/logout-all',
  'POST /auth/switch-tenant',
  'GET /auth/me',
  'GET /auth/sessions',
  'DELETE /auth/sessions/:id',
])

describe('router coverage (integration)', () => {
  let app: TestApp

  beforeAll(async () => {
    app = await createTestApp()
  })

  afterAll(async () => {
    await app.close()
  })

  it('requires every route to declare Public, NoTenant, or permissions', () => {
    const modules = app.get(ModulesContainer)
    const undeclared: string[] = []
    const noTenantRoutes: string[] = []

    for (const moduleRef of modules.values()) {
      for (const controller of moduleRef.controllers.values()) {
        const instance = controller.instance
        const metatype = controller.metatype
        if (!instance || !metatype) continue
        const prototype = Object.getPrototypeOf(instance) as object
        const controllerPath = Reflect.getMetadata(PATH_METADATA, metatype) as string | undefined
        const classPublic = Reflect.getMetadata(IS_PUBLIC_KEY, metatype) as boolean | undefined
        const classNoTenant = Reflect.getMetadata(IS_NO_TENANT_KEY, metatype) as boolean | undefined
        const classPerms = Reflect.getMetadata(REQUIRED_PERMISSIONS_METADATA_KEY, metatype) as unknown
        const classAny = Reflect.getMetadata(REQUIRED_ANY_PERMISSION_METADATA_KEY, metatype) as unknown

        for (const methodName of Object.getOwnPropertyNames(prototype)) {
          if (methodName === 'constructor') continue
          const handler = (prototype as Record<string, unknown>)[methodName]
          if (typeof handler !== 'function') continue
          const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined
          const path = Reflect.getMetadata(PATH_METADATA, handler) as string | string[] | undefined
          if (method === undefined || path === undefined) continue
          const httpMethod = METHOD_NAME[method]
          if (!httpMethod) continue

          const isPublic =
            classPublic || (Reflect.getMetadata(IS_PUBLIC_KEY, handler) as boolean | undefined)
          const isNoTenant =
            classNoTenant || (Reflect.getMetadata(IS_NO_TENANT_KEY, handler) as boolean | undefined)
          const perms =
            Reflect.getMetadata(REQUIRED_PERMISSIONS_METADATA_KEY, handler) ?? classPerms
          const anyPerms =
            Reflect.getMetadata(REQUIRED_ANY_PERMISSION_METADATA_KEY, handler) ?? classAny

          const segments = Array.isArray(path) ? path : [path]
          for (const segment of segments) {
            const full = `/${[controllerPath, segment].filter(Boolean).join('/')}`.replace(/\/+/g, '/')
            const key = `${httpMethod} ${full}`
            if (isNoTenant) noTenantRoutes.push(key)
            if (!isPublic && !isNoTenant && perms === undefined && anyPerms === undefined) {
              undeclared.push(key)
            }
          }
        }
      }
    }

    expect(undeclared).toEqual([])
    for (const route of noTenantRoutes) {
      expect(NO_TENANT_ALLOWLIST.has(route)).toBe(true)
    }
    expect(noTenantRoutes.sort()).toEqual([...NO_TENANT_ALLOWLIST].sort())
  })
})

describe('rbac matrix (integration)', () => {
  let app: TestApp
  let baseUrl: string
  let fixtures: IntegrationFixtures

  const API_HEADERS = { 'content-type': 'application/json', 'x-client': 'api' }

  async function login(email: string, password: string) {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: API_HEADERS,
      body: JSON.stringify({ email, password }),
    })
    const body = (await response.json()) as { accessToken: string }
    return body.accessToken
  }

  async function request(method: string, path: string, token?: string) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...API_HEADERS,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    })
    return response.status
  }

  beforeAll(async () => {
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
    await disconnectFixtures()
  })

  it('enforces module permission matrix by role', async () => {
    const ownerToken = await login(fixtures.ownerA.email, fixtures.ownerA.password)
    const proToken = await login(fixtures.proA.email, fixtures.proA.password)

    expect(await request('GET', '/__test__/rbac/finance', ownerToken)).toBe(200)
    expect(await request('GET', '/__test__/rbac/clinical-record', ownerToken)).toBe(200)
    expect(await request('GET', '/__test__/rbac/settings', ownerToken)).toBe(200)
    expect(await request('GET', '/__test__/rbac/users', ownerToken)).toBe(200)

    expect(await request('GET', '/__test__/rbac/finance', proToken)).toBe(403)
    expect(await request('GET', '/__test__/rbac/clinical-record', proToken)).toBe(200)
    expect(await request('GET', '/__test__/rbac/settings', proToken)).toBe(403)
    expect(await request('GET', '/__test__/rbac/users', proToken)).toBe(403)
  })

  it('returns permissions for the active tenant role', async () => {
    const multiLogin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: API_HEADERS,
      body: JSON.stringify({
        email: fixtures.multiOwner.email,
        password: fixtures.multiOwner.password,
        tenantSlug: 'studio-b',
      }),
    })
    const multi = (await multiLogin.json()) as { accessToken: string }
    const perms = await fetch(`${baseUrl}/auth/permissions`, {
      headers: { authorization: `Bearer ${multi.accessToken}` },
    })
    expect(perms.status).toBe(200)
    const body = (await perms.json()) as { role: string; permissions: string[] }
    expect(body.role).toBe('ADMIN')
    expect(body.permissions).toContain('users:write')
  })
})
