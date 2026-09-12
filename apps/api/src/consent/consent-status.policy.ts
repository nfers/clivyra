import type { ConsentRecordStatus, ConsentStatusKind, ConsentTermStatus } from '@clivyra/types'

export interface ConsentStatusInput {
  readonly latestRecordStatus: ConsentRecordStatus | null
  readonly grantedAt: Date | null
  readonly expiresAt: Date | null
  readonly termStatus: ConsentTermStatus | null
  readonly recordTermVersion: number | null
  readonly publishedVersion: number | null
  readonly publishedRequiresReconsent: boolean
  readonly now?: Date
}

/**
 * Pure policy: current consent state for one term type.
 * EXPIRED is computed (not persisted) when expiresAt is in the past.
 */
export function evaluateConsentStatus(input: ConsentStatusInput): ConsentStatusKind {
  const now = input.now ?? new Date()

  if (!input.latestRecordStatus) {
    return 'MISSING'
  }

  if (input.latestRecordStatus === 'REVOKED') {
    return 'REVOKED'
  }

  if (input.latestRecordStatus === 'EXPIRED') {
    return 'EXPIRED'
  }

  // GRANTED
  if (input.expiresAt && input.expiresAt.getTime() <= now.getTime()) {
    return 'EXPIRED'
  }

  if (
    input.publishedRequiresReconsent &&
    input.publishedVersion != null &&
    input.recordTermVersion != null &&
    input.publishedVersion > input.recordTermVersion
  ) {
    return 'NEEDS_RENEWAL'
  }

  // Accepted term may be RETIRED after a newer editorial publish without reconsent —
  // still ACTIVE until requiresReconsent or expiry.
  return 'ACTIVE'
}
