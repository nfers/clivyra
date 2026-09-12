import { createHash } from 'node:crypto'
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type {
  ConsentTermContentView,
  ConsentTermType,
  ConsentTermView,
  LegalBasis,
  TenantContext,
} from '@clivyra/types'
import { Prisma } from '@prisma/client'
import { AuditService } from '../audit/audit.service'
import { PrismaService } from '../prisma/prisma.service'

function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

function toView(row: {
  id: string
  type: ConsentTermType
  version: number
  title: string
  purposes: string[]
  legalBasis: LegalBasis
  requiresRenewalAfterDays: number | null
  requiresReconsent: boolean
  status: ConsentTermView['status']
  contentHash: string
  publishedAt: Date | null
  retiredAt: Date | null
  createdAt: Date
  updatedAt: Date
}): ConsentTermView {
  return {
    id: row.id,
    type: row.type,
    version: row.version,
    title: row.title,
    purposes: row.purposes,
    legalBasis: row.legalBasis,
    requiresRenewalAfterDays: row.requiresRenewalAfterDays,
    requiresReconsent: row.requiresReconsent,
    status: row.status,
    contentHash: row.contentHash || null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    retiredAt: row.retiredAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

@Injectable()
export class ConsentTermService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(filters: {
    type?: ConsentTermType
    status?: ConsentTermView['status']
  }): Promise<ConsentTermView[]> {
    const rows = await this.prisma.consentTerm.findMany({
      where: {
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      orderBy: [{ type: 'asc' }, { version: 'desc' }],
    })
    return rows.map(toView)
  }

  async getContent(id: string): Promise<ConsentTermContentView> {
    const row = await this.prisma.consentTerm.findFirst({ where: { id } })
    if (!row) {
      throw new NotFoundException({ code: 'TERM_NOT_FOUND', message: 'Consent term not found' })
    }
    return { ...toView(row), content: row.content }
  }

  async createDraft(
    ctx: TenantContext,
    input: {
      type: ConsentTermType
      title: string
      content: string
      purposes: string[]
      legalBasis?: LegalBasis
      requiresRenewalAfterDays?: number
    },
    actorUserId: string,
  ): Promise<ConsentTermView> {
    const row = await this.prisma.consentTerm.create({
      data: {
        tenantId: ctx.tenantId,
        type: input.type,
        version: 0,
        title: input.title,
        content: input.content,
        contentHash: '',
        purposes: input.purposes,
        legalBasis: input.legalBasis ?? 'CONSENT',
        requiresRenewalAfterDays: input.requiresRenewalAfterDays ?? null,
        status: 'DRAFT',
        createdByUserId: actorUserId,
      },
    })

    await this.audit.record({
      action: 'consent.term.created',
      entityType: 'ConsentTerm',
      entityId: row.id,
      metadata: { termId: row.id, type: row.type },
    })

    return toView(row)
  }

  async updateDraft(
    id: string,
    input: {
      title?: string
      content?: string
      purposes?: string[]
      legalBasis?: LegalBasis
      requiresRenewalAfterDays?: number | null
    },
  ): Promise<ConsentTermView> {
    const existing = await this.prisma.consentTerm.findFirst({ where: { id } })
    if (!existing) {
      throw new NotFoundException({ code: 'TERM_NOT_FOUND', message: 'Consent term not found' })
    }
    if (existing.status !== 'DRAFT') {
      throw new ConflictException({
        code: 'TERM_NOT_EDITABLE',
        message: 'Only DRAFT terms can be edited',
      })
    }

    const row = await this.prisma.consentTerm.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.purposes !== undefined ? { purposes: input.purposes } : {}),
        ...(input.legalBasis !== undefined ? { legalBasis: input.legalBasis } : {}),
        ...(input.requiresRenewalAfterDays !== undefined
          ? { requiresRenewalAfterDays: input.requiresRenewalAfterDays }
          : {}),
      },
    })
    return toView(row)
  }

  async publish(
    id: string,
    options: { requiresReconsent?: boolean } = {},
  ): Promise<ConsentTermView> {
    const requiresReconsent = options.requiresReconsent ?? false

    return this.prisma.$transaction(async (tx) => {
      const draft = await tx.consentTerm.findFirst({ where: { id } })
      if (!draft) {
        throw new NotFoundException({ code: 'TERM_NOT_FOUND', message: 'Consent term not found' })
      }
      if (draft.status !== 'DRAFT') {
        throw new ConflictException({
          code: 'TERM_NOT_DRAFT',
          message: 'Only DRAFT terms can be published',
        })
      }

      const max = await tx.consentTerm.aggregate({
        where: { type: draft.type, version: { gt: 0 } },
        _max: { version: true },
      })
      const nextVersion = (max._max.version ?? 0) + 1
      const contentHash = hashContent(draft.content)
      const now = new Date()

      const previous = await tx.consentTerm.findFirst({
        where: { type: draft.type, status: 'PUBLISHED' },
      })
      if (previous) {
        await tx.consentTerm.update({
          where: { id: previous.id },
          data: { status: 'RETIRED', retiredAt: now },
        })
      }

      const published = await tx.consentTerm.update({
        where: { id: draft.id },
        data: {
          version: nextVersion,
          contentHash,
          status: 'PUBLISHED',
          publishedAt: now,
          requiresReconsent,
        },
      })

      await this.audit.record(
        {
          action: 'consent.term.published',
          entityType: 'ConsentTerm',
          entityId: published.id,
          metadata: {
            termId: published.id,
            type: published.type,
            version: published.version,
            requiresReconsent,
          },
        },
        tx as unknown as { auditLog: { create: (args: { data: Prisma.AuditLogUncheckedCreateInput }) => Promise<unknown> } },
      )

      return toView(published)
    })
  }

  async retire(id: string): Promise<ConsentTermView> {
    const existing = await this.prisma.consentTerm.findFirst({ where: { id } })
    if (!existing) {
      throw new NotFoundException({ code: 'TERM_NOT_FOUND', message: 'Consent term not found' })
    }
    if (existing.status !== 'PUBLISHED') {
      throw new ConflictException({
        code: 'TERM_NOT_PUBLISHED',
        message: 'Only PUBLISHED terms can be retired',
      })
    }

    const row = await this.prisma.consentTerm.update({
      where: { id },
      data: { status: 'RETIRED', retiredAt: new Date() },
    })

    await this.audit.record({
      action: 'consent.term.retired',
      entityType: 'ConsentTerm',
      entityId: row.id,
      metadata: { termId: row.id, type: row.type, version: row.version },
    })

    return toView(row)
  }
}
