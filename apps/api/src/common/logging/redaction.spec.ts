import { redact } from './redaction'

describe('AppLogger redaction', () => {
  it('redacts sensitive keys including nested values', () => {
    const result = redact({
      password: 'secret',
      refreshToken: 'abc',
      authorization: 'Bearer x',
      nested: { passwordHash: 'hash', ok: 'value' },
      long: 'y'.repeat(3000),
    }) as Record<string, unknown>

    expect(result.password).toBe('[REDACTED]')
    expect(result.refreshToken).toBe('[REDACTED]')
    expect(result.authorization).toBe('[REDACTED]')
    expect((result.nested as Record<string, unknown>).passwordHash).toBe('[REDACTED]')
    expect((result.nested as Record<string, unknown>).ok).toBe('value')
    expect(String(result.long).endsWith('…')).toBe(true)
    expect(String(result.long).length).toBeLessThanOrEqual(2049)
  })
})
