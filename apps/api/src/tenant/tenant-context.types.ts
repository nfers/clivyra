import type { MembershipRole } from '@prisma/client'

export interface AuthenticatedPrincipal {
  id: string
  currentTenantId: string
}

export interface TenantContext {
  userId: string
  tenantId: string
  membershipId: string
  role: MembershipRole
}

export interface RequestWithTenantContext {
  user?: AuthenticatedPrincipal
  tenantContext?: TenantContext
}
