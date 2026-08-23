<<<<<<< HEAD
export type { AuthenticatedPrincipal, Role, TenantContext } from '@clivyra/types'
=======
import type { MembershipRole } from '@prisma/client'

export interface AuthenticatedPrincipal {
  id: string
  currentTenantId: string
  sessionId?: string
}

export interface TenantContext {
  userId: string
  tenantId: string
  membershipId: string
  role: MembershipRole
}
>>>>>>> b7a2d9c (feat(CLI-12): add auth session management)

export interface RequestWithTenantContext {
  user?: import('@clivyra/types').AuthenticatedPrincipal
  tenantContext?: import('@clivyra/types').TenantContext
}
