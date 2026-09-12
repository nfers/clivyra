import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { AuthTokenService } from './auth-token.service'
import type { RequestWithAuth } from './auth.types'
import { IS_PUBLIC_KEY } from './public.decorator'

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly tokens: AuthTokenService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (isPublic) {
      return true
    }

    const request = context.switchToHttp().getRequest<Request & RequestWithAuth>()
    const authorization = request.headers.authorization
    const accessToken = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : undefined

    if (!accessToken) {
      throw new UnauthorizedException('Authentication is required')
    }

    const payload = this.tokens.verifyAccessToken(accessToken)

    request.user = {
      userId: payload.sub,
      currentTenantId: payload.tid,
      sessionId: payload.sid,
      tokenIat: payload.iat,
    }

    return true
  }
}
