import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common'
import type { TenantContext } from '@clivyra/types'
import { RequirePermissions } from '../../rbac/permissions.decorator'
import { CurrentTenant } from '../../tenant/tenant-context.decorator'
import { CreateRoomDto, PatchRoomDto } from '../dto/studio.dto'
import { RoomsService } from './rooms.service'

@Controller('rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Get()
  @RequirePermissions('settings:read')
  list(@CurrentTenant() ctx: TenantContext) {
    return this.rooms.list(ctx)
  }

  @Post()
  @HttpCode(201)
  @RequirePermissions('settings:write')
  create(@CurrentTenant() ctx: TenantContext, @Body() dto: CreateRoomDto) {
    return this.rooms.create(ctx, dto)
  }

  @Patch(':id')
  @RequirePermissions('settings:write')
  patch(@CurrentTenant() ctx: TenantContext, @Param('id') id: string, @Body() dto: PatchRoomDto) {
    return this.rooms.patch(ctx, id, dto)
  }

  @Post(':id/deactivate')
  @RequirePermissions('settings:write')
  deactivate(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.rooms.deactivate(ctx, id)
  }
}
