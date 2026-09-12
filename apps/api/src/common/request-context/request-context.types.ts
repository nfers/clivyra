import type { TenantContext } from '@clivyra/types'

export interface RequestContext {
  /**
   * Internally generated id used for tenant/bypass bridge Maps.
   * Never derived from client headers.
   */
  readonly scopeId: string
  /**
   * Correlation id echoed as X-Request-Id (valid client value or generated).
   */
  readonly requestId: string
  readonly ip?: string
  readonly userAgent?: string
  tenantContext?: TenantContext
}
