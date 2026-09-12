import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { REQUIRED_PERMISSIONS_METADATA_KEY } from './permissions.decorator'
import { hasEveryPermission, type Permission } from './permissions'
import type { RequestWithTenantContext } from '../tenant/tenant-context.types'

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions =
      this.reflector.getAllAndOverride<Permission[]>(REQUIRED_PERMISSIONS_METADATA_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? []

    if (requiredPermissions.length === 0) {
      throw new ForbiddenException('Route permissions must be declared explicitly')
    }

    const request = context.switchToHttp().getRequest<Request & RequestWithTenantContext>()
    const tenantContext = request.tenantContext

    if (!tenantContext) {
      throw new UnauthorizedException('Tenant context is required before authorization')
    }

    if (!hasEveryPermission(tenantContext.role, requiredPermissions)) {
      throw new ForbiddenException('Insufficient permissions')
    }

    return true
  }
}
