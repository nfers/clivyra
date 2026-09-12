export type { AuthenticatedPrincipal, Role, TenantContext } from '@clivyra/types'

export interface RequestWithTenantContext {
  user?: import('@clivyra/types').AuthenticatedPrincipal
  tenantContext?: import('@clivyra/types').TenantContext
}
