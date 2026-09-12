import { isValidCnpj, isValidCpf, isValidTimezone, maskStudioDocument, normalizeCouncilNumber } from './validators'

describe('studio validators', () => {
  it('validates CPF check digits', () => {
    expect(isValidCpf('39053344705')).toBe(true)
    expect(isValidCpf('11111111111')).toBe(false)
  })

  it('validates CNPJ check digits', () => {
    expect(isValidCnpj('11222333000181')).toBe(true)
    expect(isValidCnpj('00000000000000')).toBe(false)
  })

  it('masks documents', () => {
    expect(maskStudioDocument('CNPJ', '11222333000181')).toBe('**.***.***/0001-**')
  })

  it('normalizes council numbers', () => {
    expect(normalizeCouncilNumber('123.456-F')).toBe('123456F')
  })

  it('accepts known timezones', () => {
    expect(isValidTimezone('America/Sao_Paulo')).toBe(true)
    expect(isValidTimezone('Not/AZone')).toBe(false)
  })
})
