import { AUDIT_ACTIONS } from '@clivyra/types'
import { AUDIT_METADATA_ALLOWLIST, CLINICAL_RECORD_TEXT_KEYS_FORBIDDEN } from './audit-actions'
import { AuditValidationError } from './audit.errors'
import {
  assertNoSensitiveValues,
  buildChanges,
  maskEmail,
  sanitizeMetadata,
} from './audit-sanitizer'

jest.mock('../common/logging/app-logger.service', () => ({
  AppLogger: class {
    warn() {}
    log() {}
    error() {}
  },
}))

describe('AuditSanitizer', () => {
  const prev = process.env.NODE_ENV

  afterEach(() => {
    process.env.NODE_ENV = prev
  })

  it('drops denylist and non-allowlisted keys', () => {
    process.env.NODE_ENV = 'development'
    const { metadata, droppedKeys } = sanitizeMetadata('auth.login.succeeded', {
      tenantSlug: 'studio-a',
      password: 'secret',
      nested: { token: 'abc' },
    })
    expect(metadata).toEqual({ tenantSlug: 'studio-a' })
    expect(droppedKeys).toEqual(expect.arrayContaining(['password', 'nested']))
  })

  it('throws in test when non-allowlisted keys are present', () => {
    process.env.NODE_ENV = 'test'
    expect(() =>
      sanitizeMetadata('auth.login.succeeded', {
        tenantSlug: 'ok',
        password: 'nope',
      }),
    ).toThrow(AuditValidationError)
  })

  it('keeps only allowlisted keys and masks email helpers', () => {
    process.env.NODE_ENV = 'development'
    const { metadata, droppedKeys } = sanitizeMetadata('users.invitation.created', {
      email: maskEmail('ana@example.com'),
      role: 'PROFESSIONAL',
      token: 'should-drop',
      extra: 'nope',
    })
    expect(metadata).toEqual({
      email: 'an***@example.com',
      role: 'PROFESSIONAL',
    })
    expect(droppedKeys).toEqual(expect.arrayContaining(['token', 'extra']))
  })

  it('builds diff only for requested fields', () => {
    const changes = buildChanges({
      before: { role: 'RECEPTION', email: 'a@b.com' },
      after: { role: 'ADMIN', email: 'a@b.com' },
      fields: ['role'],
    })
    expect(changes).toEqual([{ field: 'role', from: 'RECEPTION', to: 'ADMIN' }])
  })

  it('property: no sensitive key survives sanitization output', () => {
    process.env.NODE_ENV = 'development'
    const samples = [
      { password: 'x', tenantSlug: 't' },
      { refreshToken: 'r', tenantSlug: 't' },
      { accessToken: 'a', tenantSlug: 't' },
    ]
    for (const sample of samples) {
      const { metadata } = sanitizeMetadata('auth.login.succeeded', sample)
      assertNoSensitiveValues(metadata)
    }
  })

  it('every catalog action has an allowlist entry', () => {
    for (const action of AUDIT_ACTIONS) {
      expect(AUDIT_METADATA_ALLOWLIST[action]).toBeDefined()
    }
  })

  it('documents clinical free-text keys as forbidden', () => {
    expect(CLINICAL_RECORD_TEXT_KEYS_FORBIDDEN).toEqual(
      expect.arrayContaining(['notes', 'content', 'anamnesis']),
    )
  })
})
