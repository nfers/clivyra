export type HealthStatus = 'ok'

export interface HealthResponse {
  readonly status: HealthStatus
  readonly timestamp: string
}

export type { AuthenticatedPrincipal, Role, TenantContext } from './tenant'
export type {
  AuthErrorCode,
  AuthMembershipSummary,
  AuthSessionListItem,
  AuthSessionResponse,
  AuthTenantSummary,
  AuthUserSummary,
  MeMembershipOption,
  MeResponse,
  TenantSelectionOption,
  TenantSelectionRequiredResponse,
} from './auth'
export {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLE_RANK,
  ROLES,
  canAssignRole,
  hasAnyPermission,
  hasEveryPermission,
  hasPermission,
  rolePermissions,
} from './rbac'
export type { Permission } from './rbac'

export {
  AUDIT_ACTIONS,
  AUDIT_ACTION_LABELS_PT,
  isAuditAction,
} from './audit'
export type {
  AuditAction,
  AuditChangeView,
  AuditLogActorView,
  AuditLogView,
  AuditOutcome,
} from './audit'

export {
  CONSENT_TERM_TYPES,
  CONSENT_TERM_STATUSES,
  CONSENT_SUBJECT_TYPES,
  CONSENT_RECORD_STATUSES,
  CONSENT_SOURCES,
  LEGAL_BASES,
  DATA_SUBJECT_REQUEST_TYPES,
  DATA_SUBJECT_REQUEST_STATUSES,
  CONSENT_STATUS_VIEWS,
} from './consent'
export type {
  ConsentTermType,
  ConsentTermStatus,
  ConsentSubjectType,
  ConsentRecordStatus,
  ConsentSource,
  LegalBasis,
  DataSubjectRequestType,
  DataSubjectRequestStatus,
  ConsentStatusKind,
  ConsentTermView,
  ConsentTermContentView,
  ConsentRecordView,
  ConsentTypeStatusView,
  ConsentStatusMap,
  DataSubjectRequestView,
} from './consent'

export interface AuthPermissionsResponse {
  readonly role: import('./tenant').Role
  readonly permissions: readonly import('./rbac').Permission[]
}
