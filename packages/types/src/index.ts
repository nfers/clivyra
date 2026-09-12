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
