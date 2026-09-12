import { AsyncLocalStorage } from 'node:async_hooks'
import type { RequestContext } from './request-context.types'

const storage = new AsyncLocalStorage<RequestContext>()

export const RequestContextStorage = {
  run<T>(context: RequestContext, fn: () => T): T {
    return storage.run(context, fn)
  },

  get(): RequestContext | undefined {
    return storage.getStore()
  },

  require(): RequestContext {
    const context = storage.getStore()
    if (!context) {
      throw new Error('Request context is not available in AsyncLocalStorage')
    }
    return context
  },
}
