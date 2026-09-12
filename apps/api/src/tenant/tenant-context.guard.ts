import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import type { Request } from 'express'
import { AppLogger } from '../common/logging/app-logger.service'
import { RequestContextStorage } from '../common/request-context/request-context.storage'
import { TenantContextStorage } from './tenant-context.storage'
import type { RequestWithTenantContext } from './tenant-context.types'
import { TenantMembershipRepository } from './tenant-membership.repository'

@Injectable()
export class TenantContextGuard implements CanActivate {
  private readonly logger = new AppLogger()

  constructor(private readonly memberships: TenantMembershipRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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
