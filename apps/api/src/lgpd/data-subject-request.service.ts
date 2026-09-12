import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type {
  ConsentSource,
  ConsentSubjectType,
  DataSubjectRequestStatus,
  DataSubjectRequestType,
  DataSubjectRequestView,
  TenantContext,
} from '@clivyra/types'
import { AuditService } from '../audit/audit.service'
import { SubjectResolverPort } from '../consent/subject-resolver.port'
import { PrismaService } from '../prisma/prisma.service'
import { UserDataAnonymizer } from './anonymizers/user-data.anonymizer'
import { UserDataExporter } from './exporters/user-data.exporter'
import { LgpdRegistry } from './lgpd.registry'
import { decideRetention } from './retention-policy'

function slaDays(): number {
  const raw = process.env.LGPD_REQUEST_SLA_DAYS
  const parsed = raw ? Number.parseInt(raw, 10) : 15
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15
}

function toView(row: {
  id: string
  subjectType: ConsentSubjectType
  subjectId: string
  type: DataSubjectRequestType
  status: DataSubjectRequestStatus
  channel: ConsentSource
  requestedAt: Date
  dueAt: Date
  openedByUserId: string
  assignedToUserId: string | null
  resolutionNotes: string | null
  resultRef: string | null
  completedAt: Date | null
  createdAt: Date
  updatedAt: Date
}): DataSubjectRequestView {
  const now = Date.now()
  const due = row.dueAt.getTime()
  const daysRemaining = Math.ceil((due - now) / 86_400_000)
  return {
    id: row.id,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    type: row.type,
    status: row.status,
    channel: row.channel,
    requestedAt: row.requestedAt.toISOString(),
    dueAt: row.dueAt.toISOString(),
    daysRemaining,
    overdue: daysRemaining < 0 && !['COMPLETED', 'REJECTED', 'CANCELLED'].includes(row.status),
    openedByUserId: row.openedByUserId,
    assignedToUserId: row.assignedToUserId,
    resolutionNotes: row.resolutionNotes,
    resultRef: row.resultRef,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

@Injectable()
export class DataSubjectRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly subjects: SubjectResolverPort,
    private readonly registry: LgpdRegistry,
    private readonly userExporter: UserDataExporter,
    private readonly userAnonymizer: UserDataAnonymizer,
  ) {}

  /** Called from LgpdModule.onModuleInit */
  registerBuiltins(): void {
    if (!this.registry.hasExporter(this.userExporter.module)) {
      this.registry.registerExporter(this.userExporter)
    }
    if (!this.registry.hasAnonymizer(this.userAnonymizer.module)) {
      this.registry.registerAnonymizer(this.userAnonymizer)
    }
  }

  async list(filters: {
    status?: DataSubjectRequestStatus
    type?: DataSubjectRequestType
  }): Promise<DataSubjectRequestView[]> {
    const rows = await this.prisma.dataSubjectRequest.findMany({
      where: {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.type ? { type: filters.type } : {}),
      },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
    })
    return rows.map(toView)
  }

  async getById(id: string): Promise<DataSubjectRequestView> {
    const row = await this.prisma.dataSubjectRequest.findFirst({ where: { id } })
    if (!row) {
      throw new NotFoundException({ code: 'REQUEST_NOT_FOUND', message: 'LGPD request not found' })
    }
    return toView(row)
  }

  async open(
    ctx: TenantContext,
    input: {
      subjectType: ConsentSubjectType
      subjectId: string
      type: DataSubjectRequestType
      channel: ConsentSource
    },
    actorUserId: string,
    actorPermissions: readonly string[],
  ): Promise<DataSubjectRequestView> {
    const canManage = actorPermissions.includes('lgpd:manage')
    const canConsentWrite = actorPermissions.includes('consent:write')
    if (input.type === 'CONSENT_REVOCATION') {
      if (!canManage && !canConsentWrite) {
        throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Insufficient permissions' })
      }
    } else if (!canManage) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'lgpd:manage required' })
    }

    await this.subjects.resolve({
      subjectType: input.subjectType,
      subjectId: input.subjectId,
    })

    const requestedAt = new Date()
    const dueAt = new Date(requestedAt.getTime() + slaDays() * 86_400_000)

    const row = await this.prisma.dataSubjectRequest.create({
      data: {
        tenantId: ctx.tenantId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        type: input.type,
        channel: input.channel,
        requestedAt,
        dueAt,
        openedByUserId: actorUserId,
        status: 'RECEIVED',
      },
    })

    await this.audit.record({
      action: 'lgpd.request.opened',
      entityType: 'DataSubjectRequest',
      entityId: row.id,
      metadata: { requestId: row.id, type: row.type, subjectType: row.subjectType },
    })

    return toView(row)
  }

  async update(
    id: string,
    input: {
      status?: DataSubjectRequestStatus
      assignedToUserId?: string
      resolutionNotes?: string
    },
  ): Promise<DataSubjectRequestView> {
    const existing = await this.prisma.dataSubjectRequest.findFirst({ where: { id } })
    if (!existing) {
      throw new NotFoundException({ code: 'REQUEST_NOT_FOUND', message: 'LGPD request not found' })
    }

    if (input.status === 'CANCELLED' && existing.status !== 'RECEIVED') {
      throw new ConflictException({
        code: 'INVALID_TRANSITION',
        message: 'Only RECEIVED requests can be cancelled',
      })
    }
    if (input.status === 'REJECTED' && !input.resolutionNotes?.trim() && !existing.resolutionNotes) {
      throw new BadRequestException({
        code: 'RESOLUTION_NOTES_REQUIRED',
        message: 'REJECTED requires resolutionNotes',
      })
    }

    const terminal = ['COMPLETED', 'REJECTED', 'CANCELLED'] as const
    if (terminal.includes(existing.status as (typeof terminal)[number]) && input.status) {
      throw new ConflictException({
        code: 'REQUEST_TERMINAL',
        message: 'Request is already closed',
      })
    }

    const completedAt =
      input.status === 'COMPLETED' || input.status === 'REJECTED' ? new Date() : undefined

    const row = await this.prisma.dataSubjectRequest.update({
      where: { id },
      data: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.assignedToUserId !== undefined ? { assignedToUserId: input.assignedToUserId } : {}),
        ...(input.resolutionNotes !== undefined ? { resolutionNotes: input.resolutionNotes } : {}),
        ...(completedAt ? { completedAt } : {}),
      },
    })

    if (input.status === 'COMPLETED') {
      await this.audit.record({
        action: 'lgpd.request.completed',
        entityType: 'DataSubjectRequest',
        entityId: row.id,
        metadata: { requestId: row.id, type: row.type },
      })
    } else if (input.status === 'REJECTED') {
      await this.audit.record({
        action: 'lgpd.request.rejected',
        entityType: 'DataSubjectRequest',
        entityId: row.id,
        metadata: { requestId: row.id, type: row.type },
      })
    } else {
      await this.audit.record({
        action: 'lgpd.request.updated',
        entityType: 'DataSubjectRequest',
        entityId: row.id,
        metadata: { requestId: row.id, status: row.status },
      })
    }

    return toView(row)
  }

  async execute(
    ctx: TenantContext,
    id: string,
  ): Promise<{
    request: DataSubjectRequestView
    exportPayload?: { sections: unknown[]; generatedAt: string }
    erasureSummary?: Array<{ module: string; strategy: string; reason?: string; affected: number }>
  }> {
    const existing = await this.prisma.dataSubjectRequest.findFirst({ where: { id } })
    if (!existing) {
      throw new NotFoundException({ code: 'REQUEST_NOT_FOUND', message: 'LGPD request not found' })
    }
    if (['COMPLETED', 'REJECTED', 'CANCELLED'].includes(existing.status)) {
      throw new ConflictException({
        code: 'REQUEST_TERMINAL',
        message: 'Request is already closed',
      })
    }

    const subject = {
      subjectType: existing.subjectType,
      subjectId: existing.subjectId,
    }

    if (existing.type === 'EXPORT' || existing.type === 'ACCESS') {
      const sections = []
      for (const exporter of this.registry.listExporters()) {
        if (!exporter.subjectTypes.includes(existing.subjectType)) continue
        const part = await exporter.export(ctx, subject)
        sections.push(...part)
      }
      const generatedAt = new Date().toISOString()
      const payload = { sections, generatedAt, subjectType: existing.subjectType, subjectId: existing.subjectId }

      await this.prisma.dataSubjectRequest.update({
        where: { id },
        data: {
          status: 'IN_PROGRESS',
          resultRef: `inline:${id}`,
          resolutionNotes: `Export generated with sections: ${sections.map((s) => s.section).join(', ')}`,
        },
      })

      await this.audit.record({
        action: 'lgpd.request.executed',
        entityType: 'DataSubjectRequest',
        entityId: id,
        metadata: { requestId: id, type: existing.type },
      })
      await this.audit.record({
        action: 'lgpd.data.exported',
        entityType: 'DataSubjectRequest',
        entityId: id,
        metadata: {
          requestId: id,
          sections: sections.map((s) => s.section),
        },
      })

      const request = await this.getById(id)
      return { request, exportPayload: payload }
    }

    if (existing.type === 'ERASURE') {
      const summary: Array<{ module: string; strategy: string; reason?: string; affected: number }> = []

      await this.prisma.$transaction(async (tx) => {
        for (const anonymizer of this.registry.listAnonymizers()) {
          if (!anonymizer.subjectTypes.includes(existing.subjectType)) continue
          const policy = decideRetention(anonymizer.category)
          if (policy.decision === 'RETAIN') {
            summary.push({
              module: anonymizer.module,
              strategy: 'RETAINED',
              reason: policy.reason,
              affected: 0,
            })
            await this.audit.record(
              {
                action: 'lgpd.data.retained',
                entityType: 'DataSubjectRequest',
                entityId: id,
                metadata: {
                  requestId: id,
                  module: anonymizer.module,
                  category: anonymizer.category,
                  reason: policy.reason,
                },
              },
              tx as never,
            )
            continue
          }

          const result = await anonymizer.anonymize(ctx, subject, tx as never)
          summary.push({
            module: anonymizer.module,
            strategy: result.strategy,
            reason: result.reason,
            affected: result.affected,
          })
          if (result.strategy === 'RETAINED') {
            await this.audit.record(
              {
                action: 'lgpd.data.retained',
                entityType: 'DataSubjectRequest',
                entityId: id,
                metadata: {
                  requestId: id,
                  module: anonymizer.module,
                  category: anonymizer.category,
                  reason: result.reason ?? 'retained',
                },
              },
              tx as never,
            )
          } else {
            await this.audit.record(
              {
                action: 'lgpd.data.anonymized',
                entityType: 'DataSubjectRequest',
                entityId: id,
                metadata: {
                  requestId: id,
                  module: anonymizer.module,
                  strategy: result.strategy,
                  affected: result.affected,
                },
              },
              tx as never,
            )
          }
        }

        await tx.dataSubjectRequest.update({
          where: { id },
          data: {
            status: 'IN_PROGRESS',
            resolutionNotes: summary
              .map((s) => `${s.module}:${s.strategy}${s.reason ? ` (${s.reason})` : ''}`)
              .join('; ')
              .slice(0, 500),
          },
        })
      })

      await this.audit.record({
        action: 'lgpd.request.executed',
        entityType: 'DataSubjectRequest',
        entityId: id,
        metadata: { requestId: id, type: existing.type },
      })

      const request = await this.getById(id)
      return { request, erasureSummary: summary }
    }

    throw new BadRequestException({
      code: 'EXECUTE_UNSUPPORTED',
      message: `Execute is not supported for type ${existing.type}`,
    })
  }

  async getExport(
    ctx: TenantContext,
    id: string,
  ): Promise<{ sections: unknown[]; generatedAt: string }> {
    const existing = await this.prisma.dataSubjectRequest.findFirst({ where: { id } })
    if (!existing) {
      throw new NotFoundException({ code: 'REQUEST_NOT_FOUND', message: 'LGPD request not found' })
    }
    if (existing.type !== 'EXPORT' && existing.type !== 'ACCESS') {
      throw new BadRequestException({
        code: 'NOT_EXPORT',
        message: 'Request is not an export',
      })
    }
    if (!existing.resultRef) {
      throw new NotFoundException({
        code: 'EXPORT_NOT_READY',
        message: 'Export has not been executed yet',
      })
    }

    // Inline fallback (CLI-16 FileStoragePort not available): re-run exporters
    const sections = []
    for (const exporter of this.registry.listExporters()) {
      if (!exporter.subjectTypes.includes(existing.subjectType)) continue
      sections.push(
        ...(await exporter.export(ctx, {
          subjectType: existing.subjectType,
          subjectId: existing.subjectId,
        })),
      )
    }

    await this.audit.record({
      action: 'lgpd.data.exported',
      entityType: 'DataSubjectRequest',
      entityId: id,
      metadata: { requestId: id, sections: sections.map((s) => s.section) },
    })

    return { sections, generatedAt: new Date().toISOString() }
  }
}
