import { describe, expect, it } from '@jest/globals'
import { decideRetention, retentionCatalog } from './retention-policy'

describe('RetentionPolicy', () => {
  it('retains clinical records with legal reason', () => {
    const result = decideRetention('CLINICAL_RECORD')
    expect(result.decision).toBe('RETAIN')
    expect(result.reason).toMatch(/20/)
  })

  it('anonymizes user profile by default', () => {
    expect(decideRetention('USER_PROFILE').decision).toBe('ANONYMIZE')
  })

  it('retains user profile when membership is active', () => {
    const result = decideRetention('USER_PROFILE', { subjectHasActiveMembership: true })
    expect(result.decision).toBe('RETAIN')
    expect(result.reason).toMatch(/ativo/i)
  })

  it('never erases audit in P0 catalog', () => {
    expect(decideRetention('AUDIT').decision).toBe('RETAIN')
    expect(retentionCatalog().CONSENT.decision).toBe('RETAIN')
  })
})
