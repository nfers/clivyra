import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common'
import type { TenantContext } from '@clivyra/types'
import { RequireAnyPermission, RequirePermissions } from '../../rbac/permissions.decorator'
import { CurrentTenant } from '../../tenant/tenant-context.decorator'
import { EffectiveWorkingHoursQueryDto, PutWorkingHoursDto } from '../dto/studio.dto'
import { WorkingHoursService } from './working-hours.service'

@Controller('working-hours')
export class WorkingHoursController {
  constructor(private readonly workingHours: WorkingHoursService) {}

  @Get()
  @RequirePermissions('settings:read')
  get(@CurrentTenant() ctx: TenantContext, @Query('professionalId') professionalId?: string) {
    return this.workingHours.get(ctx, professionalId)
  }

  @Get('effective')
  @RequirePermissions('professionals:read')
  effective(@CurrentTenant() ctx: TenantContext, @Query() query: EffectiveWorkingHoursQueryDto) {
    return this.workingHours.effective(ctx, query.professionalId, query.date)
  }

  @Put()
  @RequirePermissions('settings:write')
  putDefault(@CurrentTenant() ctx: TenantContext, @Body() dto: PutWorkingHoursDto) {
    return this.workingHours.putDefault(ctx, dto)
  }

  @Put('professionals/:id')
  @RequireAnyPermission('professionals:write', 'professionals:self')
  putProfessional(
    @CurrentTenant() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: PutWorkingHoursDto,
  ) {
    return this.workingHours.putProfessional(ctx, id, dto)
  }
}
