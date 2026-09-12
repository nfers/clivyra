import { ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { IS_PUBLIC_KEY } from '../auth/public.decorator'
import { IS_NO_TENANT_KEY } from './no-tenant.decorator'
import { TenantContextGuard } from './tenant-context.guard'
import type { RequestWithTenantContext } from './tenant-context.types'
import type { TenantMembershipRepository } from './tenant-membership.repository'

function httpContext(request: RequestWithTenantContext & Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => function handler() {},
    getClass: () => class TestController {},
  } as ExecutionContext
}

function createGuard(
  memberships: Pick<TenantMembershipRepository, 'findActiveMembership'>,
  overrides: Partial<Record<string, boolean>> = {},
) {
  const reflector = {
    getAllAndOverride: jest.fn((key: string) => overrides[key]),
  } as unknown as Reflector
  return new TenantContextGuard(memberships as TenantMembershipRepository, reflector)
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
    const guard = createGuard(memberships)
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
    const guard = createGuard(memberships)

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
    const guard = createGuard(memberships)

    await expect(guard.canActivate(httpContext({ body: { tenantId } }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
    expect(memberships.findActiveMembership).not.toHaveBeenCalled()
  })

  it('rejects inactive or missing memberships with generic 401', async () => {
    const memberships = {
      findActiveMembership: jest.fn().mockResolvedValue(null),
    } as Pick<TenantMembershipRepository, 'findActiveMembership'>
    const guard = createGuard(memberships)

    await expect(
      guard.canActivate(httpContext({ user: { userId, currentTenantId: tenantId } })),
    ).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('skips membership resolution for @Public routes', async () => {
    const memberships = {
      findActiveMembership: jest.fn(),
    } as Pick<TenantMembershipRepository, 'findActiveMembership'>
    const guard = createGuard(memberships, { [IS_PUBLIC_KEY]: true })

    await expect(guard.canActivate(httpContext({}))).resolves.toBe(true)
    expect(memberships.findActiveMembership).not.toHaveBeenCalled()
  })

  it('skips membership resolution for @NoTenant routes', async () => {
    const memberships = {
      findActiveMembership: jest.fn(),
    } as Pick<TenantMembershipRepository, 'findActiveMembership'>
    const guard = createGuard(memberships, { [IS_NO_TENANT_KEY]: true })

    await expect(
      guard.canActivate(httpContext({ user: { userId, currentTenantId: tenantId } })),
    ).resolves.toBe(true)
    expect(memberships.findActiveMembership).not.toHaveBeenCalled()
  })
})
