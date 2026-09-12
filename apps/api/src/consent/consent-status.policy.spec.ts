import { describe, expect, it } from '@jest/globals'
import { evaluateConsentStatus } from './consent-status.policy'

describe('evaluateConsentStatus', () => {
  it('returns MISSING when no record', () => {
    expect(
      evaluateConsentStatus({
        latestRecordStatus: null,
        grantedAt: null,
        expiresAt: null,
        termStatus: null,
        recordTermVersion: null,
        publishedVersion: null,
        publishedRequiresReconsent: false,
      }),
    ).toBe('MISSING')
  })

  it('returns REVOKED for revoked records', () => {
    expect(
      evaluateConsentStatus({
        latestRecordStatus: 'REVOKED',
        grantedAt: new Date('2026-01-01'),
        expiresAt: null,
        termStatus: 'PUBLISHED',
        recordTermVersion: 1,
        publishedVersion: 1,
        publishedRequiresReconsent: false,
      }),
    ).toBe('REVOKED')
  })

  it('returns ACTIVE for valid granted', () => {
    expect(
      evaluateConsentStatus({
        latestRecordStatus: 'GRANTED',
        grantedAt: new Date('2026-01-01'),
        expiresAt: new Date('2099-01-01'),
        termStatus: 'PUBLISHED',
        recordTermVersion: 1,
        publishedVersion: 1,
        publishedRequiresReconsent: false,
        now: new Date('2026-06-01'),
      }),
    ).toBe('ACTIVE')
  })

  it('returns EXPIRED when expiresAt passed', () => {
    expect(
      evaluateConsentStatus({
        latestRecordStatus: 'GRANTED',
        grantedAt: new Date('2025-01-01'),
        expiresAt: new Date('2025-06-01'),
        termStatus: 'PUBLISHED',
        recordTermVersion: 1,
        publishedVersion: 1,
        publishedRequiresReconsent: false,
        now: new Date('2026-01-01'),
      }),
    ).toBe('EXPIRED')
  })

  it('returns NEEDS_RENEWAL when published version requires reconsent', () => {
    expect(
      evaluateConsentStatus({
        latestRecordStatus: 'GRANTED',
        grantedAt: new Date('2026-01-01'),
        expiresAt: null,
        termStatus: 'RETIRED',
        recordTermVersion: 1,
        publishedVersion: 2,
        publishedRequiresReconsent: true,
      }),
    ).toBe('NEEDS_RENEWAL')
  })

  it('keeps ACTIVE when new version does not require reconsent', () => {
    expect(
      evaluateConsentStatus({
        latestRecordStatus: 'GRANTED',
        grantedAt: new Date('2026-01-01'),
        expiresAt: null,
        termStatus: 'RETIRED',
        recordTermVersion: 1,
        publishedVersion: 2,
        publishedRequiresReconsent: false,
      }),
    ).toBe('ACTIVE')
  })
})
