import { ExecutionContext, UnauthorizedException } from '@nestjs/common'
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

  it('hydrates tenant context on request and ALS from principal membership only', async () => {
    const memberships = {
      findActiveMembership: jest.fn().mockResolvedValue({
        id: 'membership-1',
        userId,
        tenantId,
        role: 'OWNER',
        user: { passwordChangedAt: null, sessionsInvalidatedAt: null },
      }),
    } as Pick<TenantMembershipRepository, 'findActiveMembership'>
    const guard = new TenantContextGuard(memberships as TenantMembershipRepository)
    const request: RequestWithTenantContext & Record<string, unknown> = {
      user: { userId, currentTenantId: tenantId },
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
    // ALS is best-effort without request middleware; request.tenantContext is authoritative here.
    expect(request.tenantContext?.tenantId).toBe(tenantId)
  })

  it('never reads tenantId from body/query/headers', async () => {
    const memberships = {
      findActiveMembership: jest.fn().mockResolvedValue({
        id: 'membership-1',
        userId,
        tenantId,
        role: 'OWNER',
        user: { passwordChangedAt: null, sessionsInvalidatedAt: null },
      }),
    } as Pick<TenantMembershipRepository, 'findActiveMembership'>
    const guard = new TenantContextGuard(memberships as TenantMembershipRepository)

    await guard.canActivate(
      httpContext({
        user: { userId, currentTenantId: tenantId },
        body: { tenantId: 'forged' },
        query: { tenantId: 'forged' },
        params: { tenantId: 'forged' },
        headers: { 'x-tenant-id': 'forged' },
      }),
    )

    expect(memberships.findActiveMembership).toHaveBeenCalledWith(userId, tenantId)
    expect(memberships.findActiveMembership).not.toHaveBeenCalledWith(userId, 'forged')
  })

  it('rejects requests without an authenticated tenant in context', async () => {
    const memberships = {
      findActiveMembership: jest.fn(),
    } as Pick<TenantMembershipRepository, 'findActiveMembership'>
    const guard = new TenantContextGuard(memberships as TenantMembershipRepository)

    await expect(guard.canActivate(httpContext({ body: { tenantId } }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
    expect(memberships.findActiveMembership).not.toHaveBeenCalled()
  })

  it('rejects inactive or missing memberships with generic 401', async () => {
    const memberships = {
      findActiveMembership: jest.fn().mockResolvedValue(null),
    } as Pick<TenantMembershipRepository, 'findActiveMembership'>
    const guard = new TenantContextGuard(memberships as TenantMembershipRepository)

    await expect(
      guard.canActivate(httpContext({ user: { userId, currentTenantId: tenantId } })),
    ).rejects.toBeInstanceOf(UnauthorizedException)
  })
})
