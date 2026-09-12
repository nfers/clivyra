import type { ConsentSubjectType, TenantContext } from '@clivyra/types'

export interface LgpdSubject {
  readonly subjectType: ConsentSubjectType
  readonly subjectId: string
}

export interface DataExportSection {
  readonly section: string
  readonly data: unknown
}

export interface DataExporterPort {
  readonly module: string
  readonly subjectTypes: readonly ConsentSubjectType[]
  export(ctx: TenantContext, subject: LgpdSubject): Promise<DataExportSection[]>
}

export type PrismaTx = {
  user: {
    update: (args: unknown) => Promise<unknown>
  }
  membership: {
    count: (args: unknown) => Promise<number>
  }
  refreshSession: {
    updateMany: (args: unknown) => Promise<{ count: number }>
  }
  dataSubjectRequest: {
    update: (args: unknown) => Promise<unknown>
  }
  auditLog: {
    create: (args: unknown) => Promise<unknown>
  }
}
