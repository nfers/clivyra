import { AsyncLocalStorage } from 'node:async_hooks'
import type { TenantContext } from '@clivyra/types'
import { RequestContextStorage } from '../common/request-context/request-context.storage'

const fallbackAls = new AsyncLocalStorage<TenantContext>()

/** scopeId → tenant map bridges ALS gaps after async guard awaits. Never keyed by client headers. */
const tenantByScopeId = new Map<string, TenantContext>()

/**
 * Tenant context ALS facade.
 * Nest guards cannot wrap the handler in `run()`, so the request middleware
 * owns the AsyncLocalStorage store and the guard mutates `tenantContext` on it
 * (`enterWith` pattern from CLI-11 spec). A scopeId-indexed fallback covers
 * Prisma calls after async boundaries that drop `enterWith` bindings.
 */
export const TenantContextStorage = {
  enterWith(context: TenantContext): void {
    const request = RequestContextStorage.get()
    if (request) {
      request.tenantContext = context
      tenantByScopeId.set(request.scopeId, context)
    }
    fallbackAls.enterWith(context)
  },

  run<T>(context: TenantContext, fn: () => T): T {
    return fallbackAls.run(context, fn)
  },

  get(): TenantContext | undefined {
    const request = RequestContextStorage.get()
    if (request?.tenantContext) {
      return request.tenantContext
    }
    if (request?.scopeId) {
      const byScope = tenantByScopeId.get(request.scopeId)
      if (byScope) {
        return byScope
      }
    }
    return fallbackAls.getStore()
  },

  require(): TenantContext {
    const context = TenantContextStorage.get()
    if (!context) {
      throw new Error('Tenant context is not available in AsyncLocalStorage')
    }
    return context
  },

  clear(scopeId?: string): void {
    if (scopeId) {
      tenantByScopeId.delete(scopeId)
    }
  },
}
