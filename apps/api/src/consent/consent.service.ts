import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type {
  ConsentRecordView,
  ConsentSource,
  ConsentStatusMap,
  ConsentSubjectType,
  ConsentTermType,
  TenantContext,
} from '@clivyra/types'
import { CONSENT_TERM_TYPES } from '@clivyra/types'
import { Prisma } from '@prisma/client'
import { AuditService } from '../audit/audit.service'
import { hashIp, truncateUserAgent } from '../auth/auth-request.util'
import { RequestContextStorage } from '../common/request-context/request-context.storage'
import { PrismaService } from '../prisma/prisma.service'
import { evaluateConsentStatus } from './consent-status.policy'
import { SubjectResolverPort } from './subject-resolver.port'

type EvidenceInput = {
  channel?: string
  signerName?: string
  witnessUserId?: string
  ipHash?: unknown
  userAgent?: unknown
}

function toRecordView(row: {
  id: string
  subjectType: ConsentSubjectType
  subjectId: string
  termId: string
  termVersion: number
  status: ConsentRecordView['status']
  source: ConsentSource
  grantedAt: Date | null
  revokedAt: Date | null
  expiresAt: Date | null
  supersedesId: string | null
  collectedByUserId: string | null
  createdAt: Date
  term: { type: ConsentTermType }
}): ConsentRecordView {
  return {
    id: row.id,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    termId: row.termId,
    termType: row.term.type,
    termVersion: row.termVersion,
    status: row.status,
    source: row.source,
    grantedAt: row.grantedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    supersedesId: row.supersedesId,
    collectedByUserId: row.collectedByUserId,
    createdAt: row.createdAt.toISOString(),
  }
}

@Injectable()
export class ConsentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly subjects: SubjectResolverPort,
  ) {}

  async listHistory(
    subjectType: ConsentSubjectType,
    subjectId: string,
  ): Promise<ConsentRecordView[]> {
    const rows = await this.prisma.consentRecord.findMany({
      where: { subjectType, subjectId },
      include: { term: { select: { type: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return rows.map(toRecordView)
  }

  async status(subjectType: ConsentSubjectType, subjectId: string): Promise<ConsentStatusMap> {
    const records = await this.prisma.consentRecord.findMany({
      where: { subjectType, subjectId },
      include: { term: { select: { type: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    })

    const published = await this.prisma.consentTerm.findMany({
      where: { status: 'PUBLISHED' },
    })
    const publishedByType = new Map(published.map((t) => [t.type, t]))

    const latestByType = new Map<ConsentTermType, (typeof records)[number]>()
    for (const row of records) {
      if (!latestByType.has(row.term.type)) {
        latestByType.set(row.term.type, row)
      }
    }

    const result: ConsentStatusMap = {}
    for (const type of CONSENT_TERM_TYPES) {
      const latest = latestByType.get(type)
      const pub = publishedByType.get(type)
      const kind = evaluateConsentStatus({
        latestRecordStatus: latest?.status ?? null,
        grantedAt: latest?.grantedAt ?? null,
        expiresAt: latest?.expiresAt ?? null,
        termStatus: latest?.term.status ?? pub?.status ?? null,
        recordTermVersion: latest?.termVersion ?? null,
        publishedVersion: pub?.version ?? null,
        publishedRequiresReconsent: pub?.requiresReconsent ?? false,
      })
      result[type] = {
        status: kind,
        recordId: latest?.id ?? null,
        termId: latest?.termId ?? pub?.id ?? null,
        termVersion: latest?.termVersion ?? null,
        grantedAt: latest?.grantedAt?.toISOString() ?? null,
        expiresAt: latest?.expiresAt?.toISOString() ?? null,
      }
    }
    return result
  }

  async grant(
    ctx: TenantContext,
    input: {
      subjectType: ConsentSubjectType
      subjectId: string
      termId: string
      source: ConsentSource
      evidence?: EvidenceInput
      notes?: string
    },
    actorUserId: string,
  ): Promise<ConsentRecordView> {
    await this.subjects.resolve({
      subjectType: input.subjectType,
      subjectId: input.subjectId,
    })

    if (input.evidence && ('ipHash' in input.evidence || 'userAgent' in input.evidence)) {
      if (input.evidence.ipHash !== undefined || input.evidence.userAgent !== undefined) {
        throw new BadRequestException({
          code: 'EVIDENCE_FORGED',
          message: 'ipHash and userAgent must not be supplied in the body',
        })
      }
    }

    const term = await this.prisma.consentTerm.findFirst({
      where: { id: input.termId, status: 'PUBLISHED' },
    })
    if (!term) {
      throw new NotFoundException({ code: 'TERM_NOT_FOUND', message: 'Published term not found' })
    }

    const request = RequestContextStorage.get()
    const derivedEvidence: Record<string, unknown> = {
      ...(input.evidence?.channel ? { channel: input.evidence.channel } : {}),
      ...(input.evidence?.signerName ? { signerName: input.evidence.signerName } : {}),
      ...(input.evidence?.witnessUserId ? { witnessUserId: input.evidence.witnessUserId } : {}),
    }

    let collectedByUserId: string | null = null

    if (input.source === 'WEB_FORM') {
      if (!input.evidence?.channel) {
        throw new BadRequestException({
          code: 'EVIDENCE_REQUIRED',
          message: 'WEB_FORM requires evidence.channel',
        })
      }
      derivedEvidence.ipHash = request?.ip ? hashIp(request.ip) : undefined
      derivedEvidence.userAgent = truncateUserAgent(request?.userAgent)
      derivedEvidence.channel = input.evidence.channel
    } else if (input.source === 'IN_PERSON') {
      if (!input.evidence?.signerName?.trim()) {
        throw new BadRequestException({
          code: 'SIGNER_REQUIRED',
          message: 'IN_PERSON requires evidence.signerName',
        })
      }
      collectedByUserId = actorUserId
    }

    const now = new Date()
    let expiresAt: Date | null = null
    if (term.requiresRenewalAfterDays) {
      expiresAt = new Date(now.getTime() + term.requiresRenewalAfterDays * 86_400_000)
    }

    // Renewal: supersede previous GRANTED for same subject+type if present
    const previous = await this.prisma.consentRecord.findFirst({
      where: {
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        term: { type: term.type },
        status: 'GRANTED',
      },
      orderBy: { createdAt: 'desc' },
      include: { term: { select: { type: true } } },
    })

    const alreadySuperseded = previous
      ? await this.prisma.consentRecord.findFirst({
          where: { supersedesId: previous.id },
          select: { id: true },
        })
      : null

    const supersedesId =
      previous && !alreadySuperseded ? previous.id : null

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.consentRecord.create({
        data: {
          tenantId: ctx.tenantId,
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          termId: term.id,
          termVersion: term.version,
          status: 'GRANTED',
          source: input.source,
          grantedAt: now,
          expiresAt,
          supersedesId,
          collectedByUserId,
          evidence: derivedEvidence as Prisma.InputJsonValue,
          notes: input.notes ?? null,
        },
        include: { term: { select: { type: true } } },
      })

      const action = supersedesId ? 'consent.renewed' : 'consent.granted'
      await this.audit.record(
        {
          action,
          entityType: 'ConsentRecord',
          entityId: created.id,
          metadata: supersedesId
            ? {
                recordId: created.id,
                supersedesId,
                termId: term.id,
                termType: term.type,
                subjectType: input.subjectType,
              }
            : {
                recordId: created.id,
                termId: term.id,
                termType: term.type,
                subjectType: input.subjectType,
                source: input.source,
              },
        },
        tx as never,
      )

      return created
    })

    return toRecordView(row)
  }

  async revoke(
    id: string,
    actorUserId: string,
    reason?: string,
  ): Promise<ConsentRecordView> {
    const original = await this.prisma.consentRecord.findFirst({
      where: { id },
      include: { term: { select: { type: true } } },
    })
    if (!original) {
      throw new NotFoundException({ code: 'CONSENT_NOT_FOUND', message: 'Consent record not found' })
    }
    if (original.status !== 'GRANTED') {
      throw new ConflictException({
        code: 'CONSENT_NOT_GRANTED',
        message: 'Only GRANTED consents can be revoked',
      })
    }

    const superseded = await this.prisma.consentRecord.findFirst({
      where: { supersedesId: original.id },
      select: { id: true },
    })
    if (superseded) {
      throw new ConflictException({
        code: 'CONSENT_ALREADY_SUPERSEDED',
        message: 'Consent already superseded',
      })
    }

    const now = new Date()
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.consentRecord.create({
        data: {
          tenantId: original.tenantId,
          subjectType: original.subjectType,
          subjectId: original.subjectId,
          termId: original.termId,
          termVersion: original.termVersion,
          status: 'REVOKED',
          source: original.source,
          grantedAt: original.grantedAt,
          revokedAt: now,
          expiresAt: null,
          supersedesId: original.id,
          collectedByUserId: actorUserId,
          notes: reason ?? null,
        },
        include: { term: { select: { type: true } } },
      })

      await this.audit.record(
        {
          action: 'consent.revoked',
          entityType: 'ConsentRecord',
          entityId: created.id,
          metadata: {
            recordId: created.id,
            supersedesId: original.id,
            termType: original.term.type,
            subjectType: original.subjectType,
          },
        },
        tx as never,
      )

      return created
    })

    return toRecordView(row)
  }
}
