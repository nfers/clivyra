import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { Role, TenantContext } from '@clivyra/types'
import { AUTH_EVENTS_PORT, type AuthEventsPort } from '../auth/auth-events.port'
import { AuthService } from '../auth/auth.service'
import { PrismaService } from '../prisma/prisma.service'
import { MembershipPolicy } from './membership.policy'

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: MembershipPolicy,
    private readonly auth: AuthService,
    @Inject(AUTH_EVENTS_PORT) private readonly events: AuthEventsPort,
  ) {}

  async list(status?: 'active' | 'inactive', cursor?: string, limitRaw?: string) {
    const limit = Math.min(Math.max(Number(limitRaw ?? 50) || 50, 1), 100)
    const isActive = status === 'inactive' ? false : status === 'active' ? true : undefined

    const rows = await this.prisma.membership.findMany({
      where: {
        ...(isActive === undefined ? {} : { isActive }),
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: limit,
      select: {
        id: true,
        role: true,
        isActive: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            lastLoginAt: true,
          },
        },
      },
    })

    return rows.map((row) => ({
      membershipId: row.id,
      userId: row.user.id,
      name: row.user.name,
      email: row.user.email,
      role: row.role as Role,
      isActive: row.isActive,
      lastLoginAt: row.user.lastLoginAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }))
  }

  async changeRole(ctx: TenantContext, membershipId: string, role: Role) {
    const target = await this.prisma.membership.findFirst({
      where: { id: membershipId },
      select: { id: true, role: true, isActive: true, userId: true },
    })
    if (!target) {
      throw new NotFoundException()
    }

    await this.policy.assertCanChangeRole(
      ctx,
      { id: target.id, role: target.role as Role, isActive: target.isActive },
      role,
    )

    const updated = await this.prisma.membership.update({
      where: { id: target.id },
      data: { role, roleChangedAt: new Date() },
      select: { id: true, role: true },
    })

    this.events.emit('users.role.changed', {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      membershipId: updated.id,
      reason: `${target.role}->${updated.role}`,
    })

    return { membershipId: updated.id, role: updated.role as Role }
  }

  async deactivate(ctx: TenantContext, membershipId: string): Promise<void> {
    const target = await this.prisma.membership.findFirst({
      where: { id: membershipId },
      select: { id: true, role: true, isActive: true, userId: true },
    })
    if (!target) {
      throw new NotFoundException()
    }
    if (!target.isActive) {
      return
    }

    await this.policy.assertCanDeactivate(ctx, {
      id: target.id,
      role: target.role as Role,
      isActive: target.isActive,
    })

    await this.prisma.membership.update({
      where: { id: target.id },
      data: {
        isActive: false,
        deactivatedAt: new Date(),
        deactivatedById: ctx.userId,
      },
    })

    await this.auth.revokeSessionsForUserInTenant(target.userId, ctx.tenantId, 'membership_deactivated')

    this.events.emit('users.membership.deactivated', {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      membershipId: target.id,
    })
  }

  async activate(ctx: TenantContext, membershipId: string): Promise<void> {
    const target = await this.prisma.membership.findFirst({
      where: { id: membershipId },
      select: { id: true, role: true, isActive: true },
    })
    if (!target) {
      throw new NotFoundException()
    }
    if (target.isActive) {
      return
    }

    // Activating requires ability to assign that role.
    this.policy.assertCanAssignRole(ctx.role, target.role as Role)
    if (target.role === 'OWNER' && ctx.role !== 'OWNER') {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Forbidden' })
    }

    await this.prisma.membership.update({
      where: { id: target.id },
      data: {
        isActive: true,
        deactivatedAt: null,
        deactivatedById: null,
      },
    })

    this.events.emit('users.membership.activated', {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      membershipId: target.id,
    })
  }
}
