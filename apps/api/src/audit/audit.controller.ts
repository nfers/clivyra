import { Controller, Get, Param, Query } from '@nestjs/common'
import { RequirePermissions } from '../rbac/permissions.decorator'
import { Audited } from './audited.decorator'
import { AuditQueryService } from './audit-query.service'
import { AuditQueryDto } from './dto/audit-query.dto'

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly queries: AuditQueryService) {}

  @Get()
  @RequirePermissions('audit:read')
  @Audited({ action: 'audit.queried', entityType: 'AuditLog' })
  list(@Query() query: AuditQueryDto) {
    return this.queries.list(query)
  }

  @Get(':id')
  @RequirePermissions('audit:read')
  @Audited({ action: 'audit.queried', entityType: 'AuditLog', entityIdFrom: 'params.id' })
  getById(@Param('id') id: string) {
    return this.queries.getById(id)
  }
}
