import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { Observable, catchError, from, switchMap, throwError } from 'rxjs'
import { AuditService } from './audit.service'
import { AUDITED_METADATA_KEY, type AuditedOptions } from './audited.decorator'

function readPath(source: unknown, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = source
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.getAllAndOverride<AuditedOptions | undefined>(AUDITED_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!options) {
      return next.handle()
    }

    const request = context.switchToHttp().getRequest<Request>()

    return next.handle().pipe(
      switchMap((result) =>
        from(
          this.persist(options, request, result, 'SUCCESS').then(() => result),
        ),
      ),
      catchError((error: unknown) => {
        if (error instanceof ForbiddenException) {
          return from(this.persist(options, request, undefined, 'DENIED')).pipe(
            switchMap(() => throwError(() => error)),
          )
        }
        return throwError(() => error)
      }),
    )
  }

  private async persist(
    options: AuditedOptions,
    request: Request,
    result: unknown,
    outcome: 'SUCCESS' | 'DENIED',
  ): Promise<void> {
    let entityId: string | undefined
    if (options.entityIdFrom) {
      if (options.entityIdFrom.startsWith('result.')) {
        const value = readPath(result, options.entityIdFrom.slice('result.'.length))
        entityId = typeof value === 'string' ? value : undefined
      } else if (options.entityIdFrom.startsWith('params.')) {
        const value = readPath(request.params, options.entityIdFrom.slice('params.'.length))
        entityId = typeof value === 'string' ? value : undefined
      } else if (options.entityIdFrom.startsWith('body.')) {
        const value = readPath(request.body, options.entityIdFrom.slice('body.'.length))
        entityId = typeof value === 'string' ? value : undefined
      }
    }

    await this.audit.record({
      action: options.action,
      entityType: options.entityType,
      entityId,
      outcome,
      metadata: {
        route: request.route?.path ?? request.path,
        method: request.method,
      },
    })
  }
}
