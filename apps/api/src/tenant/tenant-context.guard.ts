import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { IS_PUBLIC_KEY } from '../auth/public.decorator'
import { AppLogger } from '../common/logging/app-logger.service'
import { RequestContextStorage } from '../common/request-context/request-context.storage'
import { IS_NO_TENANT_KEY } from './no-tenant.decorator'
import { TenantContextStorage } from './tenant-context.storage'
import type { RequestWithTenantContext } from './tenant-context.types'
import { TenantMembershipRepository } from './tenant-membership.repository'

@Injectable()
export class TenantContextGuard implements CanActivate {
  private readonly logger = new AppLogger()

  constructor(
    private readonly memberships: TenantMembershipRepository,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) {
      return true
    }

    const isNoTenant = this.reflector.getAllAndOverride<boolean>(IS_NO_TENANT_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isNoTenant) {
      return true
    }

    const request = context.switchToHttp().getRequest<Request & RequestWithTenantContext>()
    const principal = request.user

    if (!principal?.userId || !principal.currentTenantId) {
      this.logger.warn('tenant_context.denied', {
        metric: 'tenant_context.denied',
        reason: 'no_principal',
      })
      throw new UnauthorizedException('Authenticated tenant context is required')
    }

    const membership = await this.memberships.findActiveMembership(
      principal.userId,
      principal.currentTenantId,
    )

    if (!membership) {
      this.logger.warn('tenant_context.denied', {
        metric: 'tenant_context.denied',
        reason: 'inactive_membership',
      })
      throw new UnauthorizedException('Authenticated tenant context is required')
    }

    if (typeof principal.tokenIat === 'number') {
      const invalidatedAt = membership.user.sessionsInvalidatedAt ?? membership.user.passwordChangedAt
      if (invalidatedAt && principal.tokenIat * 1000 < invalidatedAt.getTime()) {
        this.logger.warn('tenant_context.denied', {
          metric: 'tenant_context.denied',
          reason: 'session_invalidated',
        })
        throw new UnauthorizedException('Authentication is required')
      }
    }

    const tenantContext = {
      userId: membership.userId,
      tenantId: membership.tenantId,
      membershipId: membership.id,
      role: membership.role,
    }

    request.tenantContext = tenantContext

    // Prefer mutating the request ALS store; also enterWith for fallback contexts.
    const requestStore = RequestContextStorage.get()
    if (requestStore) {
      requestStore.tenantContext = tenantContext
    }
    TenantContextStorage.enterWith(tenantContext)

    return true
  }
}
