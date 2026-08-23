import { UnauthorizedException } from '@nestjs/common'
import { AuthTokenService } from './auth-token.service'

describe('AuthTokenService', () => {
  const service = new AuthTokenService({
    accessTokenSecret: 'test-secret-with-more-than-thirty-two-chars',
    accessTokenTtlSeconds: 900,
    refreshTokenTtlSeconds: 604_800,
    passwordResetTtlSeconds: 1_800,
  })

  it('signs and verifies access tokens with tenant and session context', () => {
    const token = service.signAccessToken({
      userId: 'user-1',
      tenantId: 'tenant-a',
      sessionId: 'session-1',
    })

    expect(service.verifyAccessToken(token)).toEqual(
      expect.objectContaining({
        sub: 'user-1',
        tenantId: 'tenant-a',
        sid: 'session-1',
        type: 'access',
      }),
    )
  })

  it('rejects tokens signed by another secret', () => {
    const token = service.signAccessToken({
      userId: 'user-1',
      tenantId: 'tenant-a',
      sessionId: 'session-1',
    })
    const otherService = new AuthTokenService({
      accessTokenSecret: 'another-secret-with-more-than-thirty-two-chars',
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 604_800,
      passwordResetTtlSeconds: 1_800,
    })

    expect(() => otherService.verifyAccessToken(token)).toThrow(UnauthorizedException)
  })
})
