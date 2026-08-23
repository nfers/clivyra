import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import type { Request } from 'express'
import { AuthTokenService } from './auth-token.service'
import type { RequestWithAuth } from './auth.types'

@Injectable()
export class AuthAccessGuard implements CanActivate {
  constructor(private readonly tokens: AuthTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & RequestWithAuth>()
    const authorization = request.headers.authorization
    const accessToken = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : undefined

    if (!accessToken) {
      throw new UnauthorizedException('Authentication is required')
    }

    const payload = this.tokens.verifyAccessToken(accessToken)

    request.user = {
      id: payload.sub,
      currentTenantId: payload.tenantId,
      sessionId: payload.sid,
    }

    return true
  }
}
