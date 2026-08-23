import { createParamDecorator, ExecutionContext, InternalServerErrorException } from '@nestjs/common'
import type { Request } from 'express'
import type { RequestWithTenantContext, TenantContext } from './tenant-context.types'

export const CurrentTenant = createParamDecorator((_data: unknown, context: ExecutionContext): TenantContext => {
  const request = context.switchToHttp().getRequest<Request & RequestWithTenantContext>()

  if (!request.tenantContext) {
    throw new InternalServerErrorException('Tenant context was not initialized')
  }

  return request.tenantContext
})
