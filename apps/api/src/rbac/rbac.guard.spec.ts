import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { MembershipRole } from '@prisma/client'
import { REQUIRED_PERMISSIONS_METADATA_KEY } from './permissions.decorator'
import type { Permission } from './permissions'
import { RbacGuard } from './rbac.guard'
import type { RequestWithTenantContext } from '../tenant/tenant-context.types'

function context(role?: MembershipRole, permissions?: Permission[]): ExecutionContext {
  const handler = () => undefined
  Reflect.defineMetadata(REQUIRED_PERMISSIONS_METADATA_KEY, permissions, handler)

  return {
    getHandler: () => handler,
    getClass: () => class TestController {},
    switchToHttp: () => ({
      getRequest: () =>
        ({
          tenantContext: role
            ? {
                userId: 'user-1',
                tenantId: 'tenant-a',
                membershipId: 'membership-1',
                role,
              }
            : undefined,
        }) satisfies RequestWithTenantContext,
    }),
  } as unknown as ExecutionContext
}

describe('RbacGuard', () => {
  const guard = new RbacGuard(new Reflector())

  it('denies protected routes without tenant context', () => {
    expect(() => guard.canActivate(context(undefined, ['agenda:read']))).toThrow(UnauthorizedException)
  })

  it('denies access by default when a protected route has no explicit permissions', () => {
    expect(() => guard.canActivate(context('OWNER', []))).toThrow(ForbiddenException)
  })

  it('allows roles with every required permission', () => {
    expect(guard.canActivate(context('OWNER', ['users:write', 'finance:write']))).toBe(true)
  })

  it('denies roles missing one of the required permissions', () => {
    expect(() => guard.canActivate(context('PROFESSIONAL', ['clinical-record:read', 'finance:read']))).toThrow(
      ForbiddenException,
    )
  })
})
