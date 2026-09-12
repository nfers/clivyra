import { AuditValidationError } from './audit.errors'
import { resolveAuditContext } from './audit-context'
import { AuditService } from './audit.service'
import { RequestContextStorage } from '../common/request-context/request-context.storage'
import { TenantContextStorage } from '../tenant/tenant-context.storage'

jest.mock('../common/logging/app-logger.service', () => ({
  AppLogger: class {
    warn() {}
    log() {}
    error() {}
  },
}))

describe('AuditService.record', () => {
  const create = jest.fn().mockResolvedValue({ id: '1' })
  const bypassTenant = jest.fn(async (_reason: string, fn: () => Promise<unknown>) => fn())
  const prisma = { auditLog: { create }, bypassTenant }

  beforeEach(() => {
    create.mockClear()
    bypassTenant.mockClear()
  })

  it('uses provided tx client', async () => {
    const tx = { auditLog: { create: jest.fn().mockResolvedValue({}) } }
    await RequestContextStorage.run(
      { scopeId: 's1', requestId: 'r1', ip: '127.0.0.1' },
      async () => {
        TenantContextStorage.enterWith({
          tenantId: 't1',
          userId: 'u1',
          membershipId: 'm1',
          role: 'OWNER',
        })
        const service = new AuditService(prisma as never)
        await service.record(
          {
            action: 'users.role.changed',
            entityType: 'Membership',
            entityId: 'm1',
            metadata: { membershipId: 'm1' },
            tenantId: 't1',
          },
          tx as never,
        )
      },
    )
    expect(tx.auditLog.create).toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('errors without context and without SYSTEM actor', () => {
    expect(() =>
      RequestContextStorage.run({ scopeId: 's2', requestId: 'r2' }, () => resolveAuditContext()),
    ).toThrow(AuditValidationError)
  })

  it('errors when SYSTEM actor has no tenantId', async () => {
    const service = new AuditService(prisma as never)
    await expect(
      service.record({
        action: 'system.tenant_bypass',
        entityType: 'System',
        actor: { type: 'SYSTEM', reason: 'job' },
        metadata: { reason: 'job' },
      }),
    ).rejects.toThrow(/tenantId/)
  })
})
