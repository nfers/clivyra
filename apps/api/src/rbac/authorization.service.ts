import { ForbiddenException, Injectable } from '@nestjs/common'
import type { Permission, TenantContext } from '@clivyra/types'
import { hasPermission } from '@clivyra/types'

@Injectable()
export class AuthorizationService {
  assert(ctx: TenantContext, permission: Permission): void {
    if (!hasPermission(ctx.role, permission)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Forbidden' })
    }
  }

  can(ctx: TenantContext, permission: Permission): boolean {
    return hasPermission(ctx.role, permission)
  }

  project<T extends object>(
    ctx: TenantContext,
    dto: T,
    sensitiveFields: Partial<Record<keyof T, Permission>>,
  ): Partial<T> {
    const result: Partial<T> = { ...dto }
    for (const key of Object.keys(sensitiveFields) as Array<keyof T>) {
      const permission = sensitiveFields[key]
      if (permission && !hasPermission(ctx.role, permission)) {
        delete result[key]
      }
    }
    return result
  }
}
