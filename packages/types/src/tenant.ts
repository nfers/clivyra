export type Role = 'OWNER' | 'ADMIN' | 'PROFESSIONAL' | 'RECEPTION'

export interface AuthenticatedPrincipal {
  readonly userId: string
  readonly currentTenantId: string
  readonly sessionId?: string
}

export interface TenantContext {
  readonly userId: string
  readonly tenantId: string
  readonly membershipId: string
  readonly role: Role
}
