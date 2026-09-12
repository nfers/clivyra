import { AuthEventsAuditAdapter } from './auth-events.audit-adapter'
import type { AuditService } from './audit.service'

jest.mock('../common/logging/app-logger.service', () => ({
  AppLogger: class {
    warn() {}
    log() {}
    error() {}
  },
}))

describe('AuthEventsAuditAdapter', () => {
  const recordAccess = jest.fn().mockResolvedValue(undefined)
  const audit = { recordAccess } as unknown as AuditService

  beforeEach(() => {
    recordAccess.mockClear()
  })

  it('maps login succeeded with tenantSlug metadata', () => {
    const adapter = new AuthEventsAuditAdapter(audit)
    adapter.emit('auth.login.succeeded', {
      userId: 'u1',
      tenantId: 't1',
      tenantSlug: 'studio-a',
    })
    expect(recordAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.login.succeeded',
        tenantId: 't1',
        metadata: { tenantSlug: 'studio-a' },
      }),
    )
  })

  it('skips login failed without tenant', () => {
    const adapter = new AuthEventsAuditAdapter(audit)
    adapter.emit('auth.login.failed', { userId: 'u1' })
    expect(recordAccess).not.toHaveBeenCalled()
  })

  it('maps role changed with changes', () => {
    const adapter = new AuthEventsAuditAdapter(audit)
    adapter.emit('users.role.changed', {
      tenantId: 't1',
      membershipId: 'm1',
      fromRole: 'RECEPTION',
      toRole: 'ADMIN',
    })
    expect(recordAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'users.role.changed',
        changes: {
          before: { role: 'RECEPTION' },
          after: { role: 'ADMIN' },
          fields: ['role'],
        },
      }),
    )
  })

  it('maps refresh reuse as DENIED', () => {
    const adapter = new AuthEventsAuditAdapter(audit)
    adapter.emit('auth.refresh.reuse_detected', {
      tenantId: 't1',
      familyId: 'fam-1',
    })
    expect(recordAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.refresh.reuse_detected',
        outcome: 'DENIED',
        metadata: { familyId: 'fam-1' },
      }),
    )
  })

  it('respects persist:false', () => {
    const adapter = new AuthEventsAuditAdapter(audit)
    adapter.emit('users.role.changed', { tenantId: 't1', persist: false })
    expect(recordAccess).not.toHaveBeenCalled()
  })
})
