import { Injectable } from '@nestjs/common'
import type { TenantContext } from '@clivyra/types'
import { PrismaService } from '../../prisma/prisma.service'
import type { DataExportSection, DataExporterPort, LgpdSubject } from '../ports/data-exporter.port'

@Injectable()
export class UserDataExporter implements DataExporterPort {
  readonly module = 'users'
  readonly subjectTypes = ['USER'] as const

  constructor(private readonly prisma: PrismaService) {}

  async export(ctx: TenantContext, subject: LgpdSubject): Promise<DataExportSection[]> {
    if (subject.subjectType !== 'USER') return []

    const user = await this.prisma.bypassTenant('lgpd-export-user', () =>
      this.prisma.user.findUnique({
        where: { id: subject.subjectId },
        select: { id: true, name: true, email: true, isActive: true, createdAt: true, lastLoginAt: true },
      }),
    )
    if (!user) return []

    const memberships = await this.prisma.membership.findMany({
      where: { userId: subject.subjectId },
      select: { id: true, role: true, isActive: true, createdAt: true, deactivatedAt: true },
    })

    const sessions = await this.prisma.refreshSession.findMany({
      where: { userId: subject.subjectId },
      select: { id: true, createdAt: true, lastUsedAt: true, expiresAt: true, revokedAt: true, userAgent: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    const consents = await this.prisma.consentRecord.findMany({
      where: { subjectType: 'USER', subjectId: subject.subjectId },
      select: {
        id: true,
        status: true,
        termVersion: true,
        source: true,
        grantedAt: true,
        revokedAt: true,
        createdAt: true,
        term: { select: { type: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const since = new Date()
    since.setFullYear(since.getFullYear() - 1)

    const audit = await this.prisma.auditLog.findMany({
      where: {
        actorUserId: subject.subjectId,
        occurredAt: { gte: since },
      },
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        outcome: true,
        occurredAt: true,
      },
      orderBy: { occurredAt: 'desc' },
      take: 500,
    })

    return [
      {
        section: 'profile',
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          isActive: user.isActive,
          createdAt: user.createdAt.toISOString(),
          lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
          tenantId: ctx.tenantId,
        },
      },
      {
        section: 'memberships',
        data: memberships.map((m) => ({
          id: m.id,
          role: m.role,
          isActive: m.isActive,
          createdAt: m.createdAt.toISOString(),
          deactivatedAt: m.deactivatedAt?.toISOString() ?? null,
        })),
      },
      {
        section: 'sessions',
        data: sessions.map((s) => ({
          id: s.id,
          createdAt: s.createdAt.toISOString(),
          lastUsedAt: s.lastUsedAt?.toISOString() ?? null,
          expiresAt: s.expiresAt.toISOString(),
          revokedAt: s.revokedAt?.toISOString() ?? null,
          userAgent: s.userAgent,
        })),
      },
      {
        section: 'consents',
        data: consents.map((c) => ({
          id: c.id,
          status: c.status,
          termType: c.term.type,
          termTitle: c.term.title,
          termVersion: c.termVersion,
          source: c.source,
          grantedAt: c.grantedAt?.toISOString() ?? null,
          revokedAt: c.revokedAt?.toISOString() ?? null,
          createdAt: c.createdAt.toISOString(),
        })),
      },
      {
        section: 'audit',
        data: audit.map((a) => ({
          id: a.id,
          action: a.action,
          entityType: a.entityType,
          entityId: a.entityId,
          outcome: a.outcome,
          occurredAt: a.occurredAt.toISOString(),
        })),
      },
    ]
  }
}
