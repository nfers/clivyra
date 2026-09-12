import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { Request, Response } from 'express'
import { Observable } from 'rxjs'
import {
  REQUEST_ID_HEADER,
  resolveCorrelationId,
  truncateUserAgent,
} from '../request-context/request-context.middleware'
import { RequestContextStorage } from '../request-context/request-context.storage'
import type { RequestContext } from '../request-context/request-context.types'
import { TenantContextStorage } from '../../tenant/tenant-context.storage'
import type { RequestWithTenantContext } from '../../tenant/tenant-context.types'

/**
 * Re-binds RequestContext (+ optional TenantContext) in ALS for the Nest handler Observable.
 * Preserves middleware `scopeId` so bridge Maps stay correctly keyed.
 */
@Injectable()
export class ContextAlsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp()
    const req = http.getRequest<Request & RequestWithTenantContext>()
    const res = http.getResponse<Response>()
    const existing = RequestContextStorage.get()

    const scopeId = existing?.scopeId ?? randomUUID()
    const requestId =
      existing?.requestId ??
      (typeof res.getHeader(REQUEST_ID_HEADER) === 'string'
        ? (res.getHeader(REQUEST_ID_HEADER) as string)
        : resolveCorrelationId(req.headers[REQUEST_ID_HEADER]))

    if (!res.getHeader(REQUEST_ID_HEADER)) {
      res.setHeader(REQUEST_ID_HEADER, requestId)
    }

    const store: RequestContext = {
      scopeId,
      requestId,
      ip: existing?.ip ?? req.ip,
      userAgent: existing?.userAgent ?? truncateUserAgent(req.headers['user-agent']),
      tenantContext: req.tenantContext ?? existing?.tenantContext,
    }

    return new Observable((subscriber) => {
      const subscription = RequestContextStorage.run(store, () => {
        if (store.tenantContext) {
          TenantContextStorage.enterWith(store.tenantContext)
        }
        return next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        })
      })
      return () => subscription.unsubscribe()
    })
  }
}
