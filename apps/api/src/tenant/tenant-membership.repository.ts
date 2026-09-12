import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class TenantMembershipRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveMembership(userId: string, tenantId: string) {
    return this.prisma.bypassTenant('resolve-membership', () =>
      this.prisma.membership.findFirst({
        where: {
          userId,
          tenantId,
          isActive: true,
          user: { isActive: true },
          tenant: { isActive: true },
        },
        select: {
          id: true,
          userId: true,
          tenantId: true,
          role: true,
          user: {
            select: {
              passwordChangedAt: true,
              sessionsInvalidatedAt: true,
            },
          },
        },
      }),
    )
  }
}
