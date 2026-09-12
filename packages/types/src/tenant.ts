export type Role = 'OWNER' | 'ADMIN' | 'PROFESSIONAL' | 'RECEPTION'

export interface AuthenticatedPrincipal {
  readonly userId: string
  readonly currentTenantId: string
  readonly sessionId?: string
  /** Access token `iat` (seconds). Used to invalidate sessions after password reset / logout-all. */
  readonly tokenIat?: number
}

export interface TenantContext {
  readonly userId: string
  readonly tenantId: string
  readonly membershipId: string
  readonly role: Role
}
