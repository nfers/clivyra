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

export interface AuthPermissionsResponse {
  readonly role: import('./tenant').Role
  readonly permissions: readonly import('./rbac').Permission[]
}
