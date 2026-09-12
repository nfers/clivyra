import { ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthGuard } from './auth.guard'
import { AuthTokenService } from './auth-token.service'
import type { RequestWithAuth } from './auth.types'
import { IS_PUBLIC_KEY } from './public.decorator'

function httpContext(
  request: RequestWithAuth & { headers: Record<string, string | undefined> },
  handlerPublic = false,
): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext
}

describe('AuthGuard', () => {
  const tokens = new AuthTokenService({
    accessTokenSecret: 'test-secret-with-more-than-thirty-two-chars',
    accessTokenTtlSeconds: 900,
    refreshTokenTtlSeconds: 604_800,
    passwordResetTtlSeconds: 1_800,
  })

  it('hydrates request.user with userId from a valid bearer token', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector
    const guard = new AuthGuard(tokens, reflector)
    const access = tokens.signAccessToken({
      userId: 'user-1',
      tenantId: 'tenant-a',
      sessionId: 'session-1',
    })
    const request: RequestWithAuth & { headers: Record<string, string> } = {
      headers: { authorization: `Bearer ${access.token}` },
    }

    expect(guard.canActivate(httpContext(request))).toBe(true)
    expect(request.user).toEqual({
      userId: 'user-1',
      currentTenantId: 'tenant-a',
      sessionId: 'session-1',
      tokenIat: expect.any(Number),
    })
  })

  it('skips authentication for @Public routes', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockImplementation((key: string) => key === IS_PUBLIC_KEY),
    } as unknown as Reflector
    const guard = new AuthGuard(tokens, reflector)

    expect(guard.canActivate(httpContext({ headers: {} }))).toBe(true)
  })

  it('rejects missing bearer token', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector
    const guard = new AuthGuard(tokens, reflector)

    expect(() => guard.canActivate(httpContext({ headers: {} }))).toThrow(UnauthorizedException)
  })
})
