import { Injectable, NotFoundException } from '@nestjs/common'
import type { ConsentSubjectType } from '@clivyra/types'
import { PrismaService } from '../prisma/prisma.service'

export interface SubjectRef {
  readonly subjectType: ConsentSubjectType
  readonly subjectId: string
}

/**
 * Validates that a consent/LGPD subject exists in the current tenant.
 * PATIENT/LEAD resolvers are registered when those modules land.
 */
export abstract class SubjectResolverPort {
  abstract resolve(subject: SubjectRef): Promise<void>
}

@Injectable()
export class UserSubjectResolver extends SubjectResolverPort {
  constructor(private readonly prisma: PrismaService) {
    super()
  }

  async resolve(subject: SubjectRef): Promise<void> {
    if (subject.subjectType !== 'USER') {
      throw new NotFoundException({
        code: 'SUBJECT_TYPE_UNSUPPORTED',
        message: `Subject type ${subject.subjectType} is not available yet`,
      })
    }

    const membership = await this.prisma.membership.findFirst({
      where: { userId: subject.subjectId },
      select: { id: true },
    })
    if (!membership) {
      throw new NotFoundException({
        code: 'SUBJECT_NOT_FOUND',
        message: 'Subject not found in this tenant',
      })
    }
  }
}
