import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals'
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants'
import { RequestMethod } from '@nestjs/common'
import { ModulesContainer, Reflector } from '@nestjs/core'
import { IS_PUBLIC_KEY } from '../../src/auth/public.decorator'
import { createTestApp, type TestApp } from './setup/test-app'
import { AuthTokenService } from '../../src/auth/auth-token.service'

describe('auth protection (integration)', () => {
  let app: TestApp
  let baseUrl: string

  beforeAll(async () => {
    app = await createTestApp()
    await app.listen(0)
    const address = app.getHttpServer().address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    await app.close()
  })

  it('rejects private routes without a bearer token', async () => {
    const modules = app.get(ModulesContainer)
    const reflector = app.get(Reflector)
    const privatePaths: string[] = []

    for (const moduleRef of modules.values()) {
      for (const controller of moduleRef.controllers.values()) {
        const instance = controller.instance
        if (!instance) continue
        const prototype = Object.getPrototypeOf(instance) as object
        const controllerPath = Reflect.getMetadata(PATH_METADATA, controller.metatype) as string | undefined
        const classPublic = reflector.get(IS_PUBLIC_KEY, controller.metatype)

        for (const methodName of Object.getOwnPropertyNames(prototype)) {
          if (methodName === 'constructor') continue
          const handler = (prototype as Record<string, unknown>)[methodName]
          if (typeof handler !== 'function') continue
          const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined
          const path = Reflect.getMetadata(PATH_METADATA, handler) as string | string[] | undefined
          if (method === undefined || path === undefined) continue
          const isPublic = classPublic || reflector.get(IS_PUBLIC_KEY, handler)
          if (isPublic) continue
          const segments = Array.isArray(path) ? path : [path]
          for (const segment of segments) {
            const full = `/${[controllerPath, segment].filter(Boolean).join('/')}`.replace(/\/+/g, '/')
            if (full.includes(':') || full.includes('__test__')) continue
            privatePaths.push(full)
          }
        }
      }
    }

    expect(privatePaths.length).toBeGreaterThan(0)

    for (const path of privatePaths) {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'GET',
        headers: { 'content-type': 'application/json' },
      })
      expect(response.status).toBe(401)
    }
  })

  it('rejects expired and alg-none access tokens', async () => {
    const tokens = new AuthTokenService({
      accessTokenSecret: process.env.AUTH_ACCESS_TOKEN_SECRET ?? 'local-development-access-token-secret-change-me',
      accessTokenTtlSeconds: -10,
      refreshTokenTtlSeconds: 60,
      passwordResetTtlSeconds: 60,
    })
    const expired = tokens.signAccessToken({
      userId: 'user-1',
      tenantId: 'tenant-1',
      sessionId: 'session-1',
    })
    const expiredResponse = await fetch(`${baseUrl}/auth/me`, {
      headers: { authorization: `Bearer ${expired.token}` },
    })
    expect(expiredResponse.status).toBe(401)

    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
    const body = Buffer.from(
      JSON.stringify({
        sub: 'user-1',
        tid: 'tenant-1',
        sid: 'session-1',
        typ: 'access',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 900,
        jti: 'x',
      }),
    ).toString('base64url')
    const noneResponse = await fetch(`${baseUrl}/auth/me`, {
      headers: { authorization: `Bearer ${header}.${body}.` },
    })
    expect(noneResponse.status).toBe(401)
  })
})
