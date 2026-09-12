import type { TenantContext } from '@clivyra/types'

export interface RequestContext {
  readonly requestId: string
  readonly ip?: string
  readonly userAgent?: string
  tenantContext?: TenantContext
}
