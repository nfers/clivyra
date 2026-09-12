import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import type { Role, TenantContext } from '@clivyra/types'
import { canAssignRole } from '@clivyra/types'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class MembershipPolicy {
  constructor(private readonly prisma: PrismaService) {}

  assertCanAssignRole(actor: Role, target: Role): void {
    if (!canAssignRole(actor, target)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Forbidden' })
    }
  }

  assertNotSelf(actorMembershipId: string, targetMembershipId: string): void {
    if (actorMembershipId === targetMembershipId) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Forbidden' })
    }
  }

  async assertCanChangeRole(
    ctx: TenantContext,
    target: { id: string; role: Role; isActive: boolean },
    nextRole: Role,
  ): Promise<void> {
    this.assertCanAssignRole(ctx.role, nextRole)

    if (target.role === 'OWNER' && ctx.role !== 'OWNER') {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Forbidden' })
    }

    if (target.role === 'OWNER' && nextRole !== 'OWNER' && target.isActive) {
      await this.assertNotLastActiveOwner(target.id)
    }

    this.assertNotSelf(ctx.membershipId, target.id)
  }

  async assertCanDeactivate(
    ctx: TenantContext,
    target: { id: string; role: Role; isActive: boolean },
  ): Promise<void> {
    if (target.role === 'OWNER' && target.isActive) {
      if (ctx.role !== 'OWNER') {
        throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Forbidden' })
      }
      await this.assertNotLastActiveOwner(target.id)
    }

    this.assertNotSelf(ctx.membershipId, target.id)
  }

  private async assertNotLastActiveOwner(excludingMembershipId: string): Promise<void> {
    const otherOwners = await this.prisma.membership.count({
      where: {
        role: 'OWNER',
        isActive: true,
        id: { not: excludingMembershipId },
      },
    })
    if (otherOwners === 0) {
      throw new ConflictException({
        code: 'LAST_OWNER',
        message: 'Tenant must keep at least one active owner',
      })
    }
  }
}
