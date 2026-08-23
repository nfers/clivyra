import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import type { Request } from 'express'
import { TenantMembershipRepository } from './tenant-membership.repository'
import type { RequestWithTenantContext } from './tenant-context.types'

@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(private readonly memberships: TenantMembershipRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & RequestWithTenantContext>()
    const principal = request.user

    if (!principal?.id || !principal.currentTenantId) {
      throw new UnauthorizedException('Authenticated tenant context is required')
    }

    const membership = await this.memberships.findActiveMembership(principal.id, principal.currentTenantId)

    if (!membership) {
      throw new UnauthorizedException('Active tenant membership is required')
    }

    request.tenantContext = {
      userId: membership.userId,
      tenantId: membership.tenantId,
      membershipId: membership.id,
      role: membership.role,
    }

    return true
  }
}
