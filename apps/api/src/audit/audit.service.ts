import { Injectable } from '@nestjs/common'
import type { AuditAction, AuditOutcome } from '@clivyra/types'
import { isAuditAction } from '@clivyra/types'
import { Prisma } from '@prisma/client'
import { AppLogger } from '../common/logging/app-logger.service'
import { PrismaService } from '../prisma/prisma.service'
import { resolveAuditContext } from './audit-context'
import { AuditValidationError } from './audit.errors'
import { buildChanges, sanitizeMetadata, type ChangeInput } from './audit-sanitizer'

type AuditTx = {
  auditLog: {
    create: (args: { data: Prisma.AuditLogUncheckedCreateInput }) => Promise<unknown>
  }
}

export interface RecordInput {
  action: AuditAction
  entityType: string
  entityId?: string
  outcome?: AuditOutcome
  metadata?: Record<string, unknown>
  changes?: ChangeInput
  actor?: { type: 'SYSTEM'; reason: string }
  tenantId?: string
}

@Injectable()
export class AuditService {
  private readonly logger = new AppLogger()

  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordInput, tx?: AuditTx): Promise<void> {
    await this.write(input, tx, { swallow: false })
  }

  async recordAccess(input: RecordInput): Promise<void> {
    try {
      await this.write(input, undefined, { swallow: false })
    } catch (error) {
      this.logger.error('audit.write_failed', {
        metric: 'audit.write_failed',
        action: input.action,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private async write(
    input: RecordInput,
    tx: AuditTx | undefined,
    options: { swallow: boolean },
  ): Promise<void> {
    if (!isAuditAction(input.action)) {
      throw new AuditValidationError(`Unknown audit action: ${input.action}`)
    }
    if (!input.entityType?.trim()) {
      throw new AuditValidationError('entityType is required')
    }

    const actor = resolveAuditContext({
      actor: input.actor,
      tenantId: input.tenantId,
    })
    const tenantId = input.tenantId ?? actor.tenantId
    if (!tenantId) {
      throw new AuditValidationError('tenantId is required for AuditLog')
    }

    const { metadata } = sanitizeMetadata(input.action, input.metadata)
    const changes = input.changes ? buildChanges(input.changes) : null

    const data: Prisma.AuditLogUncheckedCreateInput = {
      tenantId,
      actorUserId: actor.actorUserId,
      actorMembershipId: actor.actorMembershipId,
      actorRole: actor.actorRole,
      actorType: actor.actorType,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      outcome: input.outcome ?? 'SUCCESS',
      requestId: actor.requestId,
      ipHash: actor.ipHash,
      userAgent: actor.userAgent,
      metadata: metadata === null ? Prisma.JsonNull : (metadata as Prisma.InputJsonValue),
      changes: changes === null ? Prisma.JsonNull : (changes as Prisma.InputJsonValue),
    }

    try {
      const client = (tx ?? this.prisma) as AuditTx
      await this.prisma.bypassTenant('audit-record', async () => {
        await client.auditLog.create({ data })
      })
      this.logger.log('audit.recorded', {
        metric: 'audit.recorded',
        action: input.action,
      })
    } catch (error) {
      if (options.swallow) {
        this.logger.error('audit.write_failed', {
          metric: 'audit.write_failed',
          action: input.action,
          error: error instanceof Error ? error.message : String(error),
        })
        return
      }
      throw error
    }
  }
}
