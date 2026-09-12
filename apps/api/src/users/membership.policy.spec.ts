import { ConflictException, ForbiddenException } from '@nestjs/common'
import type { TenantContext } from '@clivyra/types'
import { MembershipPolicy } from '../users/membership.policy'
import type { PrismaService } from '../prisma/prisma.service'

describe('MembershipPolicy', () => {
  const ctxOwner: TenantContext = {
    userId: 'owner',
    tenantId: 't1',
    membershipId: 'm-owner',
    role: 'OWNER',
  }

  it('blocks self role change when other owners exist', async () => {
    const prisma = {
      membership: { count: jest.fn().mockResolvedValue(1) },
    } as unknown as PrismaService
    const policy = new MembershipPolicy(prisma)
    await expect(
      policy.assertCanChangeRole(ctxOwner, { id: 'm-owner', role: 'OWNER', isActive: true }, 'ADMIN'),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('blocks ADMIN from assigning OWNER', () => {
    const policy = new MembershipPolicy({} as PrismaService)
    expect(() => policy.assertCanAssignRole('ADMIN', 'OWNER')).toThrow(ForbiddenException)
  })

  it('blocks demoting the last active OWNER with LAST_OWNER', async () => {
    const prisma = {
      membership: {
        count: jest.fn().mockResolvedValue(0),
      },
    } as unknown as PrismaService
    const policy = new MembershipPolicy(prisma)
    await expect(
      policy.assertCanChangeRole(ctxOwner, { id: 'm-other', role: 'OWNER', isActive: true }, 'ADMIN'),
    ).rejects.toBeInstanceOf(ConflictException)
  })
})
