import type { TenantContext } from '../tenant/tenant-context.types'

export interface AuthenticatedUser {
  id: string
  currentTenantId: string
  sessionId: string
}

export interface RequestWithAuth {
  user?: AuthenticatedUser
}

export interface AuthenticatedSessionResponse {
  accessToken: string
  refreshToken: string
  user: {
    id: string
    email: string
    name: string
  }
  tenantContext: TenantContext
}
