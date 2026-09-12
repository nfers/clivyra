import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import type { Request } from 'express'
import type { AuthenticatedPrincipal } from '@clivyra/types'
import type { RequestWithTenantContext } from '../tenant/tenant-context.types'

export const TEST_PRINCIPAL_HEADER = 'x-test-principal'

/**
 * Test-only principal injector. Must never be registered when NODE_ENV !== 'test'.
 */
@Injectable()
export class TestPrincipalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('TestPrincipalGuard must not run outside NODE_ENV=test')
    }

    const request = context.switchToHttp().getRequest<Request & RequestWithTenantContext>()
    const raw = request.headers[TEST_PRINCIPAL_HEADER]
    const value = Array.isArray(raw) ? raw[0] : raw

    if (!value) {
      throw new UnauthorizedException('Authenticated tenant context is required')
    }

    let principal: AuthenticatedPrincipal
    try {
      principal = JSON.parse(value) as AuthenticatedPrincipal
    } catch {
      throw new UnauthorizedException('Authenticated tenant context is required')
    }

    if (!principal?.userId || !principal.currentTenantId) {
      throw new UnauthorizedException('Authenticated tenant context is required')
    }

    request.user = {
      userId: principal.userId,
      currentTenantId: principal.currentTenantId,
      sessionId: principal.sessionId,
    }

    return true
  }
}

export function isTestPrincipalGuardAllowed(nodeEnv: string | undefined = process.env.NODE_ENV): boolean {
  return nodeEnv === 'test'
}
