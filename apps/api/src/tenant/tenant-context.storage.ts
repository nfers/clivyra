import { AsyncLocalStorage } from 'node:async_hooks'
import type { TenantContext } from '@clivyra/types'

const storage = new AsyncLocalStorage<TenantContext>()

export const TenantContextStorage = {
  run<T>(context: TenantContext, fn: () => T): T {
    return storage.run(context, fn)
  },

  /**
   * Nest guards cannot wrap the handler in `run()`. Call this after the
   * request ALS store is already established by RequestContextMiddleware.
   */
  enterWith(context: TenantContext): void {
    storage.enterWith(context)
  },

  get(): TenantContext | undefined {
    return storage.getStore()
  },

  require(): TenantContext {
    const context = storage.getStore()
    if (!context) {
      throw new Error('Tenant context is not available in AsyncLocalStorage')
    }
    return context
  },
}
