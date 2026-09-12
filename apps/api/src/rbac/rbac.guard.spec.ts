import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { IS_PUBLIC_KEY } from '../auth/public.decorator'
import { IS_NO_TENANT_KEY } from '../tenant/no-tenant.decorator'
import {
  REQUIRED_ANY_PERMISSION_METADATA_KEY,
  REQUIRED_PERMISSIONS_METADATA_KEY,
} from './permissions.decorator'
import { RbacGuard } from './rbac.guard'

function httpContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => function handler() {},
    getClass: () => class TestController {},
  } as ExecutionContext
}

function createGuard(overrides: Partial<Record<string, unknown>> = {}) {
  const reflector = {
    getAllAndOverride: jest.fn((key: string) => overrides[key]),
  } as unknown as Reflector
  return new RbacGuard(reflector)
}

describe('RbacGuard', () => {
  it('returns 403 undeclared when permissions metadata is missing', () => {
    const guard = createGuard()
    expect(() =>
      guard.canActivate(httpContext({ method: 'GET', path: '/x', tenantContext: { role: 'OWNER' } })),
    ).toThrow(ForbiddenException)
  })

  it('skips for @Public', () => {
    const guard = createGuard({ [IS_PUBLIC_KEY]: true })
    expect(guard.canActivate(httpContext({}))).toBe(true)
  })

  it('skips for @NoTenant', () => {
    const guard = createGuard({ [IS_NO_TENANT_KEY]: true })
    expect(guard.canActivate(httpContext({}))).toBe(true)
  })

  it('allows empty @RequirePermissions for any tenant role', () => {
    const guard = createGuard({ [REQUIRED_PERMISSIONS_METADATA_KEY]: [] })
    expect(
      guard.canActivate(httpContext({ method: 'GET', path: '/auth/permissions', tenantContext: { role: 'RECEPTION' } })),
    ).toBe(true)
  })

  it('denies when role lacks required permissions', () => {
    const guard = createGuard({ [REQUIRED_PERMISSIONS_METADATA_KEY]: ['users:read'] })
    expect(() =>
      guard.canActivate(
        httpContext({ method: 'GET', path: '/users', tenantContext: { role: 'RECEPTION' } }),
      ),
    ).toThrow(ForbiddenException)
  })

  it('allows when role has every required permission', () => {
    const guard = createGuard({ [REQUIRED_PERMISSIONS_METADATA_KEY]: ['users:read'] })
    expect(
      guard.canActivate(httpContext({ method: 'GET', path: '/users', tenantContext: { role: 'OWNER' } })),
    ).toBe(true)
  })

  it('supports RequireAnyPermission (OR)', () => {
    const guard = createGuard({ [REQUIRED_ANY_PERMISSION_METADATA_KEY]: ['finance:read', 'settings:read'] })
    expect(
      guard.canActivate(
        httpContext({ method: 'GET', path: '/x', tenantContext: { role: 'RECEPTION' } }),
      ),
    ).toBe(true)
  })

  it('handler metadata overrides class via reflector getAllAndOverride', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => {
        if (key === REQUIRED_PERMISSIONS_METADATA_KEY) return ['finance:read']
        return undefined
      }),
    } as unknown as Reflector
    const guard = new RbacGuard(reflector)
    expect(() =>
      guard.canActivate(
        httpContext({ method: 'GET', path: '/x', tenantContext: { role: 'RECEPTION' } }),
      ),
    ).toThrow(ForbiddenException)
  })
})
