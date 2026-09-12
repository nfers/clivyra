import { ForbiddenException } from '@nestjs/common'
import { of, throwError, lastValueFrom } from 'rxjs'
import { AuditInterceptor } from './audit.interceptor'
import type { AuditService } from './audit.service'
import { AUDITED_METADATA_KEY } from './audited.decorator'

describe('AuditInterceptor', () => {
  const audit = {
    record: jest.fn().mockResolvedValue(undefined),
  }
  const reflector = {
    getAllAndOverride: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  function createInterceptor() {
    return new AuditInterceptor(reflector as never, audit as unknown as AuditService)
  }

  it('records SUCCESS after handler', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) =>
      key === AUDITED_METADATA_KEY
        ? { action: 'audit.queried', entityType: 'AuditLog', entityIdFrom: 'result.id' }
        : undefined,
    )
    const interceptor = createInterceptor()
    const request = { method: 'GET', path: '/audit-logs', route: { path: '/audit-logs' }, params: {} }
    const result = await lastValueFrom(
      interceptor.intercept(
        {
          getHandler: () => ({}),
          getClass: () => ({}),
          switchToHttp: () => ({ getRequest: () => request }),
        } as never,
        { handle: () => of({ id: 'log-1' }) },
      ),
    )
    expect(result).toEqual({ id: 'log-1' })
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'audit.queried',
        outcome: 'SUCCESS',
        entityId: 'log-1',
      }),
    )
  })

  it('records DENIED on ForbiddenException', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      action: 'users.role.changed',
      entityType: 'Membership',
      entityIdFrom: 'params.id',
    })
    const interceptor = createInterceptor()
    const request = {
      method: 'PATCH',
      path: '/users/m1/role',
      route: { path: '/users/:id/role' },
      params: { id: 'm1' },
    }
    await expect(
      lastValueFrom(
        interceptor.intercept(
          {
            getHandler: () => ({}),
            getClass: () => ({}),
            switchToHttp: () => ({ getRequest: () => request }),
          } as never,
          { handle: () => throwError(() => new ForbiddenException()) },
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'DENIED', entityId: 'm1' }),
    )
  })

  it('does not record on generic 400-style errors', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      action: 'audit.queried',
      entityType: 'AuditLog',
    })
    const interceptor = createInterceptor()
    await expect(
      lastValueFrom(
        interceptor.intercept(
          {
            getHandler: () => ({}),
            getClass: () => ({}),
            switchToHttp: () => ({
              getRequest: () => ({ method: 'GET', path: '/', params: {} }),
            }),
          } as never,
          { handle: () => throwError(() => new Error('bad request')) },
        ),
      ),
    ).rejects.toThrow('bad request')
    expect(audit.record).not.toHaveBeenCalled()
  })
})
