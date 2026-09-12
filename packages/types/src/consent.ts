export const CONSENT_TERM_TYPES = [
  'PRIVACY_POLICY',
  'DATA_PROCESSING',
  'TREATMENT',
  'IMAGE_USE',
  'COMMUNICATIONS',
] as const

export type ConsentTermType = (typeof CONSENT_TERM_TYPES)[number]

export const CONSENT_TERM_STATUSES = ['DRAFT', 'PUBLISHED', 'RETIRED'] as const
export type ConsentTermStatus = (typeof CONSENT_TERM_STATUSES)[number]

export const CONSENT_SUBJECT_TYPES = ['PATIENT', 'LEAD', 'USER'] as const
export type ConsentSubjectType = (typeof CONSENT_SUBJECT_TYPES)[number]

export const CONSENT_RECORD_STATUSES = ['GRANTED', 'REVOKED', 'EXPIRED'] as const
export type ConsentRecordStatus = (typeof CONSENT_RECORD_STATUSES)[number]

export const CONSENT_SOURCES = ['WEB_FORM', 'IN_PERSON', 'IMPORT', 'API'] as const
export type ConsentSource = (typeof CONSENT_SOURCES)[number]

export const LEGAL_BASES = [
  'CONSENT',
  'CONTRACT',
  'LEGAL_OBLIGATION',
  'HEALTH_PROTECTION',
  'LEGITIMATE_INTEREST',
] as const
export type LegalBasis = (typeof LEGAL_BASES)[number]

export const DATA_SUBJECT_REQUEST_TYPES = [
  'ACCESS',
  'EXPORT',
  'RECTIFICATION',
  'ERASURE',
  'CONSENT_REVOCATION',
] as const
export type DataSubjectRequestType = (typeof DATA_SUBJECT_REQUEST_TYPES)[number]

export const DATA_SUBJECT_REQUEST_STATUSES = [
  'RECEIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
] as const
export type DataSubjectRequestStatus = (typeof DATA_SUBJECT_REQUEST_STATUSES)[number]

/** Computed consent status for a subject × term type. */
export const CONSENT_STATUS_VIEWS = [
  'ACTIVE',
  'NEEDS_RENEWAL',
  'REVOKED',
  'MISSING',
  'EXPIRED',
] as const
export type ConsentStatusKind = (typeof CONSENT_STATUS_VIEWS)[number]

export interface ConsentTermView {
  readonly id: string
  readonly type: ConsentTermType
  readonly version: number
  readonly title: string
  readonly purposes: readonly string[]
  readonly legalBasis: LegalBasis
  readonly requiresRenewalAfterDays: number | null
  readonly requiresReconsent: boolean
  readonly status: ConsentTermStatus
  readonly contentHash: string | null
  readonly publishedAt: string | null
  readonly retiredAt: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface ConsentTermContentView extends ConsentTermView {
  readonly content: string
}

export interface ConsentRecordView {
  readonly id: string
  readonly subjectType: ConsentSubjectType
  readonly subjectId: string
  readonly termId: string
  readonly termType: ConsentTermType
  readonly termVersion: number
  readonly status: ConsentRecordStatus
  readonly source: ConsentSource
  readonly grantedAt: string | null
  readonly revokedAt: string | null
  readonly expiresAt: string | null
  readonly supersedesId: string | null
  readonly collectedByUserId: string | null
  readonly createdAt: string
}

export interface ConsentTypeStatusView {
  readonly status: ConsentStatusKind
  readonly recordId: string | null
  readonly termId: string | null
  readonly termVersion: number | null
  readonly grantedAt: string | null
  readonly expiresAt: string | null
}

export type ConsentStatusMap = Partial<Record<ConsentTermType, ConsentTypeStatusView>>

export interface DataSubjectRequestView {
  readonly id: string
  readonly subjectType: ConsentSubjectType
  readonly subjectId: string
  readonly type: DataSubjectRequestType
  readonly status: DataSubjectRequestStatus
  readonly channel: ConsentSource
  readonly requestedAt: string
  readonly dueAt: string
  readonly daysRemaining: number
  readonly overdue: boolean
  readonly openedByUserId: string
  readonly assignedToUserId: string | null
  readonly resolutionNotes: string | null
  readonly resultRef: string | null
  readonly completedAt: string | null
  readonly createdAt: string
  readonly updatedAt: string
}
