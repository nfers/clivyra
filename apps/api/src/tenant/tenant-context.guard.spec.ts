import { ExecutionContext, UnauthorizedException } from '@nestjs/common'
import type { MembershipRole } from '@prisma/client'
import { TenantContextGuard } from './tenant-context.guard'
import type { RequestWithTenantContext } from './tenant-context.types'
import type { TenantMembershipRepository } from './tenant-membership.repository'

function httpContext(request: RequestWithTenantContext & Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext
}

describe('TenantContextGuard', () => {
  const tenantId = 'tenant-a'
  const userId = 'user-1'

  it('hydrates tenant context from authenticated principal and active membership only', async () => {
    const memberships = {
      findActiveMembership: jest.fn().mockResolvedValue({
        id: 'membership-1',
        userId,
        tenantId,
        role: 'OWNER' satisfies MembershipRole,
      }),
    } as Pick<TenantMembershipRepository, 'findActiveMembership'>
    const guard = new TenantContextGuard(memberships as TenantMembershipRepository)
    const request: RequestWithTenantContext & Record<string, unknown> = {
      user: { id: userId, currentTenantId: tenantId },
      body: { tenantId: 'tenant-b' },
      query: { tenantId: 'tenant-b' },
      headers: { 'x-tenant-id': 'tenant-b' },
    }

    await expect(guard.canActivate(httpContext(request))).resolves.toBe(true)

    expect(memberships.findActiveMembership).toHaveBeenCalledWith(userId, tenantId)
    expect(request.tenantContext).toEqual({
      userId,
      tenantId,
      membershipId: 'membership-1',
      role: 'OWNER',
    })
  })

  it('rejects requests without an authenticated tenant in context', async () => {
    const memberships = {
      findActiveMembership: jest.fn(),
    } as Pick<TenantMembershipRepository, 'findActiveMembership'>
    const guard = new TenantContextGuard(memberships as TenantMembershipRepository)

    await expect(guard.canActivate(httpContext({ body: { tenantId } }))).rejects.toBeInstanceOf(UnauthorizedException)
    expect(memberships.findActiveMembership).not.toHaveBeenCalled()
  })

  it('rejects inactive or missing memberships', async () => {
    const memberships = {
      findActiveMembership: jest.fn().mockResolvedValue(null),
    } as Pick<TenantMembershipRepository, 'findActiveMembership'>
    const guard = new TenantContextGuard(memberships as TenantMembershipRepository)

    await expect(
      guard.canActivate(httpContext({ user: { id: userId, currentTenantId: tenantId } })),
    ).rejects.toBeInstanceOf(UnauthorizedException)
  })
})
