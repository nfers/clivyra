import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common'
import type { AuthenticatedPrincipal, Permission, TenantContext } from '@clivyra/types'
import { rolePermissions } from '@clivyra/types'
import type { Response } from 'express'
import { CurrentUser } from '../auth/current-user.decorator'
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator'
import { CurrentTenant } from '../tenant/tenant-context.decorator'
import { DataSubjectRequestService } from './data-subject-request.service'
import {
  CreateDataSubjectRequestDto,
  ListDataSubjectRequestsQueryDto,
  UpdateDataSubjectRequestDto,
} from './dto/lgpd.dto'

@Controller('lgpd/requests')
export class LgpdController {
  constructor(private readonly requests: DataSubjectRequestService) {}

  @Get()
  @RequirePermissions('lgpd:manage')
  list(@Query() query: ListDataSubjectRequestsQueryDto) {
    return this.requests.list({ status: query.status, type: query.type })
  }

  @Post()
  @HttpCode(201)
  @RequireAnyPermission('lgpd:manage', 'consent:write')
  create(
    @CurrentTenant() ctx: TenantContext,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: CreateDataSubjectRequestDto,
  ) {
    const permissions = rolePermissions(ctx.role) as readonly Permission[]
    return this.requests.open(ctx, dto, user.userId, permissions)
  }

  @Get(':id')
  @RequirePermissions('lgpd:manage')
  getById(@Param('id') id: string) {
    return this.requests.getById(id)
  }

  @Patch(':id')
  @RequirePermissions('lgpd:manage')
  update(@Param('id') id: string, @Body() dto: UpdateDataSubjectRequestDto) {
    return this.requests.update(id, dto)
  }

  @Post(':id/execute')
  @HttpCode(200)
  @RequirePermissions('lgpd:manage')
  execute(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.requests.execute(ctx, id)
  }

  @Get(':id/export')
  @RequirePermissions('lgpd:manage')
  @Header('content-disposition', 'attachment; filename="lgpd-export.json"')
  async downloadExport(
    @CurrentTenant() ctx: TenantContext,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const payload = await this.requests.getExport(ctx, id)
    res.setHeader('content-type', 'application/json')
    return payload
  }
}
