import type { ConsentSubjectType, TenantContext } from '@clivyra/types'
import type { RetentionCategory } from '../retention-policy'
import type { LgpdSubject, PrismaTx } from './data-exporter.port'

export interface DataAnonymizerPort {
  readonly module: string
  readonly category: RetentionCategory
  readonly subjectTypes: readonly ConsentSubjectType[]
  anonymize(
    ctx: TenantContext,
    subject: LgpdSubject,
    tx: PrismaTx,
  ): Promise<{ affected: number; strategy: 'ERASED' | 'ANONYMIZED' | 'RETAINED'; reason?: string }>
}
