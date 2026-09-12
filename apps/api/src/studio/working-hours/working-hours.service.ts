import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import type {
  EffectiveWorkingHoursView,
  TenantContext,
  WorkingHoursEntryView,
  WorkingHoursSetView,
} from '@clivyra/types'
import { hasPermission } from '@clivyra/types'
import { AuditService } from '../../audit/audit.service'
import { PrismaService } from '../../prisma/prisma.service'
import { AuthorizationService } from '../../rbac/authorization.service'
import type { PutWorkingHoursDto } from '../dto/studio.dto'
import { WorkingHoursPolicy } from './working-hours.policy'

@Injectable()
export class WorkingHoursService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
    private readonly policy: WorkingHoursPolicy,
  ) {}

  async get(ctx: TenantContext, professionalId?: string): Promise<WorkingHoursSetView> {
    this.authz.assert(ctx, 'settings:read')
    if (professionalId) {
      await this.requireProfessional(professionalId)
    }
    const rows = await this.prisma.workingHours.findMany({
      where: professionalId ? { professionalId } : { professionalId: null },
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
    })
    return {
      professionalId: professionalId ?? null,
      entries: rows.map((row) => ({
        weekday: row.weekday,
        startTime: row.startTime,
        endTime: row.endTime,
      })),
    }
  }

  async putDefault(ctx: TenantContext, dto: PutWorkingHoursDto): Promise<WorkingHoursSetView> {
    this.authz.assert(ctx, 'settings:write')
    const entries = this.policy.assertEntries(dto.entries)
    await this.replaceSet(null, entries, ctx.tenantId)
    await this.audit.record({
      action: 'working_hours.updated',
      entityType: 'WorkingHours',
      entityId: ctx.tenantId,
      metadata: { professionalId: null, entryCount: entries.length },
    })
    return { professionalId: null, entries }
  }

  async putProfessional(
    ctx: TenantContext,
    professionalId: string,
    dto: PutWorkingHoursDto,
  ): Promise<WorkingHoursSetView> {
    const professional = await this.requireProfessional(professionalId)
    const isSelf = professional.membershipId === ctx.membershipId
    if (!hasPermission(ctx.role, 'professionals:write') && !isSelf) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Forbidden' })
    }
    if (isSelf && !hasPermission(ctx.role, 'professionals:write')) {
      this.authz.assert(ctx, 'professionals:self')
    } else {
      this.authz.assert(ctx, 'professionals:write')
    }
    const entries = this.policy.assertEntries(dto.entries)
    await this.replaceSet(professionalId, entries, ctx.tenantId)
    await this.audit.record({
      action: 'working_hours.updated',
      entityType: 'WorkingHours',
      entityId: professionalId,
      metadata: { professionalId, entryCount: entries.length },
    })
    return { professionalId, entries }
  }

  async effective(
    ctx: TenantContext,
    professionalId: string,
    date: string,
  ): Promise<EffectiveWorkingHoursView> {
    this.authz.assert(ctx, 'professionals:read')
    await this.requireProfessional(professionalId)
    const weekday = weekdayFromDate(date)
    const [overrides, defaults, anyOverride] = await Promise.all([
      this.prisma.workingHours.findMany({ where: { professionalId } }),
      this.prisma.workingHours.findMany({ where: { professionalId: null } }),
      this.prisma.workingHours.count({ where: { professionalId } }),
    ])
    return this.policy.effective({
      professionalId,
      date,
      weekday,
      overrides: mapEntries(overrides),
      defaults: mapEntries(defaults),
      hasAnyOverride: anyOverride > 0,
    })
  }

  private async replaceSet(
    professionalId: string | null,
    entries: WorkingHoursEntryView[],
    tenantId: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.workingHours.deleteMany({
        where: professionalId ? { professionalId } : { professionalId: null },
      })
      if (entries.length === 0) return
      await tx.workingHours.createMany({
        data: entries.map((entry) => ({
          tenantId,
          professionalId,
          weekday: entry.weekday,
          startTime: entry.startTime,
          endTime: entry.endTime,
        })),
      })
    })
  }

  private async requireProfessional(id: string) {
    const row = await this.prisma.professional.findFirst({
      where: { id },
      select: { id: true, membershipId: true },
    })
    if (!row) throw new NotFoundException()
    return row
  }
}

function mapEntries(
  rows: Array<{ weekday: number; startTime: string; endTime: string }>,
): WorkingHoursEntryView[] {
  return rows.map((row) => ({
    weekday: row.weekday,
    startTime: row.startTime,
    endTime: row.endTime,
  }))
}

function weekdayFromDate(date: string): number {
  // Interpret as local calendar date without timezone shift (YYYY-MM-DD → UTC noon).
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()
}
