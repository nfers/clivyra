import { ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { AuthAccessGuard } from './auth-access.guard'
import { AuthTokenService } from './auth-token.service'
import type { RequestWithAuth } from './auth.types'

function httpContext(request: RequestWithAuth & { headers: Record<string, string | undefined> }): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext
}

describe('AuthAccessGuard', () => {
  const tokens = new AuthTokenService({
    accessTokenSecret: 'test-secret-with-more-than-thirty-two-chars',
    accessTokenTtlSeconds: 900,
    refreshTokenTtlSeconds: 604_800,
    passwordResetTtlSeconds: 1_800,
  })

  it('hydrates request.user from a valid bearer token', async () => {
    const guard = new AuthAccessGuard(tokens)
    const accessToken = tokens.signAccessToken({
      userId: 'user-1',
      tenantId: 'tenant-a',
      sessionId: 'session-1',
    })
    const request: RequestWithAuth & { headers: Record<string, string> } = {
      headers: { authorization: `Bearer ${accessToken}` },
    }

    await expect(guard.canActivate(httpContext(request))).resolves.toBe(true)

    expect(request.user).toEqual({
      id: 'user-1',
      currentTenantId: 'tenant-a',
      sessionId: 'session-1',
    })
  })

  it('rejects missing bearer token', async () => {
    const guard = new AuthAccessGuard(tokens)

    await expect(guard.canActivate(httpContext({ headers: {} }))).rejects.toBeInstanceOf(UnauthorizedException)
  })
})
