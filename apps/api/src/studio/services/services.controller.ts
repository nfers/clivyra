import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common'
import type { TenantContext } from '@clivyra/types'
import { RequirePermissions } from '../../rbac/permissions.decorator'
import { CurrentTenant } from '../../tenant/tenant-context.decorator'
import { CreateServiceDto, PatchServiceDto } from '../dto/studio.dto'
import { ServicesCatalogService } from './services.service'

@Controller('services')
export class ServicesController {
  constructor(private readonly services: ServicesCatalogService) {}

  @Get()
  @RequirePermissions('settings:read')
  list(@CurrentTenant() ctx: TenantContext) {
    return this.services.list(ctx)
  }

  @Post()
  @HttpCode(201)
  @RequirePermissions('settings:write')
  create(@CurrentTenant() ctx: TenantContext, @Body() dto: CreateServiceDto) {
    return this.services.create(ctx, dto)
  }

  @Patch(':id')
  @RequirePermissions('settings:write')
  patch(@CurrentTenant() ctx: TenantContext, @Param('id') id: string, @Body() dto: PatchServiceDto) {
    return this.services.patch(ctx, id, dto)
  }

  @Post(':id/deactivate')
  @RequirePermissions('settings:write')
  deactivate(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.services.deactivate(ctx, id)
  }
}
