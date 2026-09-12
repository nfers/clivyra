import type { Role } from './tenant'

export interface AuthUserSummary {
  readonly id: string
  readonly name: string
  readonly email: string
}

export interface AuthTenantSummary {
  readonly id: string
  readonly slug: string
  readonly name: string
}

export interface AuthMembershipSummary {
  readonly id: string
  readonly role: Role
}

export interface AuthSessionResponse {
  readonly accessToken: string
  readonly accessTokenExpiresAt: string
  readonly refreshToken?: string
  readonly user: AuthUserSummary
  readonly tenant: AuthTenantSummary
  readonly membership: AuthMembershipSummary
}

export interface TenantSelectionOption {
  readonly tenantId: string
  readonly slug: string
  readonly name: string
}

export interface TenantSelectionRequiredResponse {
  readonly code: 'TENANT_SELECTION_REQUIRED'
  readonly tenants: TenantSelectionOption[]
}

export interface MeMembershipOption {
  readonly tenantId: string
  readonly slug: string
  readonly name: string
  readonly role: Role
}

export interface MeResponse {
  readonly user: AuthUserSummary
  readonly tenant: AuthTenantSummary
  readonly membership: AuthMembershipSummary
  readonly memberships: MeMembershipOption[]
}

export interface AuthSessionListItem {
  readonly id: string
  readonly createdAt: string
  readonly lastUsedAt: string | null
  readonly userAgent: string | null
  readonly current: boolean
}

export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_LOCKED'
  | 'TENANT_SELECTION_REQUIRED'
  | 'EMAIL_IN_USE'
  | 'SIGNUP_DISABLED'
  | 'INVALID_REFRESH_TOKEN'
  | 'INVALID_RESET_TOKEN'
