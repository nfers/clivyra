import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Permission } from '@clivyra/types'
import { hasAnyPermission, hasEveryPermission } from '@clivyra/types'
import type { Request } from 'express'
import { IS_PUBLIC_KEY } from '../auth/public.decorator'
import { AppLogger } from '../common/logging/app-logger.service'
import { IS_NO_TENANT_KEY } from '../tenant/no-tenant.decorator'
import type { RequestWithTenantContext } from '../tenant/tenant-context.types'
import {
  REQUIRED_ANY_PERMISSION_METADATA_KEY,
  REQUIRED_PERMISSIONS_METADATA_KEY,
} from './permissions.decorator'

@Injectable()
export class RbacGuard implements CanActivate {
  private readonly logger = new AppLogger()

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) {
      return true
    }

    const isNoTenant = this.reflector.getAllAndOverride<boolean>(IS_NO_TENANT_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isNoTenant) {
      return true
    }

    const requiredAll = this.reflector.getAllAndOverride<Permission[] | undefined>(
      REQUIRED_PERMISSIONS_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    )
    const requiredAny = this.reflector.getAllAndOverride<Permission[] | undefined>(
      REQUIRED_ANY_PERMISSION_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    )

    if (requiredAll === undefined && requiredAny === undefined) {
      const request = context.switchToHttp().getRequest<Request>()
      const route = `${request.method} ${request.route?.path ?? request.path}`
      this.logger.error('rbac.undeclared_route', {
        metric: 'rbac.undeclared_route',
        route,
      })
      throw new ForbiddenException({
        code: 'ROUTE_PERMISSIONS_UNDECLARED',
        message: 'Forbidden',
      })
    }

    const request = context.switchToHttp().getRequest<Request & RequestWithTenantContext>()
    const role = request.tenantContext?.role

    if (!role) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Forbidden' })
    }

    if (requiredAll !== undefined) {
      if (requiredAll.length === 0) {
        return true
      }
      if (!hasEveryPermission(role, requiredAll)) {
        this.logger.warn('rbac.denied', {
          metric: 'rbac.denied',
          permission: requiredAll.join(','),
          role,
          route: `${request.method} ${request.route?.path ?? request.path}`,
        })
        throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Forbidden' })
      }
    }

    if (requiredAny !== undefined) {
      if (requiredAny.length === 0 || !hasAnyPermission(role, requiredAny)) {
        this.logger.warn('rbac.denied', {
          metric: 'rbac.denied',
          permission: requiredAny.join('|'),
          role,
          route: `${request.method} ${request.route?.path ?? request.path}`,
        })
        throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Forbidden' })
      }
    }

    return true
  }
}
