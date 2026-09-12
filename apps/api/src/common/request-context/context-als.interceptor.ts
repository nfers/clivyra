import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import type { Request, Response } from 'express'
import { Observable } from 'rxjs'
import {
  REQUEST_ID_HEADER,
  resolveRequestId,
  truncateUserAgent,
} from '../request-context/request-context.middleware'
import { RequestContextStorage } from '../request-context/request-context.storage'
import type { RequestContext } from '../request-context/request-context.types'
import { TenantContextStorage } from '../../tenant/tenant-context.storage'
import type { RequestWithTenantContext } from '../../tenant/tenant-context.types'

/**
 * Binds RequestContext (+ optional TenantContext) in ALS for the Nest handler Observable.
 * Guards run first and may set `request.tenantContext`; this interceptor propagates it into ALS
 * for Prisma tenantScoped and logging.
 */
@Injectable()
export class ContextAlsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp()
    const req = http.getRequest<Request & RequestWithTenantContext>()
    const res = http.getResponse<Response>()

    const requestId =
      RequestContextStorage.get()?.requestId ??
      (typeof res.getHeader(REQUEST_ID_HEADER) === 'string'
        ? (res.getHeader(REQUEST_ID_HEADER) as string)
        : resolveRequestId(req.headers[REQUEST_ID_HEADER]))

    if (!res.getHeader(REQUEST_ID_HEADER)) {
      res.setHeader(REQUEST_ID_HEADER, requestId)
    }

    const store: RequestContext = {
      requestId,
      ip: req.ip ?? RequestContextStorage.get()?.ip,
      userAgent:
        truncateUserAgent(req.headers['user-agent']) ?? RequestContextStorage.get()?.userAgent,
      tenantContext: req.tenantContext,
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
