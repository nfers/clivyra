import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { AuditLogView, AuditOutcome } from '@clivyra/types'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { AuditQueryDto } from './dto/audit-query.dto'

const MAX_WINDOW_MS = 90 * 24 * 60 * 60 * 1000

@Injectable()
export class AuditQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AuditQueryDto): Promise<{ items: AuditLogView[]; nextCursor: string | null }> {
    const now = Date.now()
    const to = query.to ? new Date(query.to) : new Date(now)
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - MAX_WINDOW_MS)

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException({ code: 'INVALID_DATE', message: 'Invalid date range' })
    }
    if (to.getTime() - from.getTime() > MAX_WINDOW_MS) {
      throw new BadRequestException({
        code: 'AUDIT_WINDOW_TOO_LARGE',
        message: 'Audit query window cannot exceed 90 days',
      })
    }

    const limit = Math.min(Math.max(query.limit ?? 50, 1), 100)
    const where: Prisma.AuditLogWhereInput = {
      occurredAt: { gte: from, lte: to },
    }

    if (query.action) {
      // Exact action or module prefix ending with "." (e.g. "users.")
      where.action = query.action.endsWith('.')
        ? { startsWith: query.action }
        : { equals: query.action }
    }
    if (query.entityType) where.entityType = query.entityType
    if (query.entityId) where.entityId = query.entityId
    if (query.actorUserId) where.actorUserId = query.actorUserId
    if (query.outcome) where.outcome = query.outcome

    if (query.cursor) {
      const [occurredAtRaw, id] = query.cursor.split('|')
      const occurredAt = new Date(occurredAtRaw ?? '')
      if (!id || Number.isNaN(occurredAt.getTime())) {
        throw new BadRequestException({ code: 'INVALID_CURSOR', message: 'Invalid cursor' })
      }
      where.AND = [
        {
          OR: [
            { occurredAt: { lt: occurredAt } },
            { AND: [{ occurredAt }, { id: { lt: id } }] },
          ],
        },
      ]
    }

    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    })

    const page = rows.slice(0, limit)
    const actorIds = [...new Set(page.map((row) => row.actorUserId).filter(Boolean))] as string[]
    const actors =
      actorIds.length > 0
        ? await this.prisma.bypassTenant('audit-actor-names', () =>
            this.prisma.user.findMany({
              where: { id: { in: actorIds } },
              select: { id: true, name: true },
            }),
          )
        : []
    const nameById = new Map(actors.map((actor) => [actor.id, actor.name]))

    const items = page.map((row) => this.toView(row, nameById))
    const last = page.at(-1)
    const nextCursor =
      rows.length > limit && last ? `${last.occurredAt.toISOString()}|${last.id}` : null

    return { items, nextCursor }
  }

  async getById(id: string): Promise<AuditLogView> {
    const row = await this.prisma.auditLog.findFirst({ where: { id } })
    if (!row) {
      throw new NotFoundException()
    }
    let name: string | null = null
    if (row.actorUserId) {
      const user = await this.prisma.bypassTenant('audit-actor-name', () =>
        this.prisma.user.findUnique({
          where: { id: row.actorUserId! },
          select: { name: true },
        }),
      )
      name = user?.name ?? null
    }
    const nameById = new Map(row.actorUserId && name ? [[row.actorUserId, name]] : [])
    return this.toView(row, nameById)
  }

  private toView(
    row: {
      id: string
      occurredAt: Date
      action: string
      entityType: string
      entityId: string | null
      outcome: AuditOutcome
      actorUserId: string | null
      actorRole: string | null
      requestId: string | null
      metadata: Prisma.JsonValue
      changes: Prisma.JsonValue
    },
    nameById: Map<string, string>,
  ): AuditLogView {
    return {
      id: row.id,
      occurredAt: row.occurredAt.toISOString(),
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      outcome: row.outcome,
      actor: {
        userId: row.actorUserId,
        name: row.actorUserId ? (nameById.get(row.actorUserId) ?? null) : null,
        role: row.actorRole,
      },
      requestId: row.requestId,
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      changes: (row.changes as AuditLogView['changes']) ?? null,
    }
  }
}
