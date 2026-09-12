import { Injectable } from '@nestjs/common'
import type { TenantContext } from '@clivyra/types'
import { PrismaService } from '../../prisma/prisma.service'
import { decideRetention } from '../retention-policy'
import type { DataAnonymizerPort } from '../ports/data-anonymizer.port'
import type { LgpdSubject, PrismaTx } from '../ports/data-exporter.port'

@Injectable()
export class UserDataAnonymizer implements DataAnonymizerPort {
  readonly module = 'users'
  readonly category = 'USER_PROFILE' as const
  readonly subjectTypes = ['USER'] as const

  constructor(private readonly prisma: PrismaService) {}

  async anonymize(
    _ctx: TenantContext,
    subject: LgpdSubject,
    tx: PrismaTx,
  ): Promise<{ affected: number; strategy: 'ERASED' | 'ANONYMIZED' | 'RETAINED'; reason?: string }> {
    if (subject.subjectType !== 'USER') {
      return { affected: 0, strategy: 'RETAINED', reason: 'Subject type not USER' }
    }

    const activeAnywhere = await this.prisma.bypassTenant('lgpd-anonymize-check', () =>
      tx.membership.count({
        where: { userId: subject.subjectId, isActive: true },
      }),
    )

    const decision = decideRetention('USER_PROFILE', {
      subjectHasActiveMembership: activeAnywhere > 0,
    })
    if (decision.decision === 'RETAIN') {
      return { affected: 0, strategy: 'RETAINED', reason: decision.reason }
    }

    const now = new Date()
    await this.prisma.bypassTenant('lgpd-anonymize-user', async () => {
      await tx.user.update({
        where: { id: subject.subjectId },
        data: {
          name: 'Usuário removido',
          email: `deleted+${subject.subjectId}@anon.clivyra.local`,
          passwordHash: null,
          isActive: false,
          sessionsInvalidatedAt: now,
        },
      })
      await tx.refreshSession.updateMany({
        where: { userId: subject.subjectId, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'lgpd_erasure' },
      })
    })

    return { affected: 1, strategy: 'ANONYMIZED' }
  }
}
