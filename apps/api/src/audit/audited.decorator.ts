import { SetMetadata } from '@nestjs/common'
import type { AuditAction } from '@clivyra/types'

export const AUDITED_METADATA_KEY = 'clivyra.audited'

export interface AuditedOptions {
  action: AuditAction
  entityType: string
  /** Dot path into request params/body or handler result, e.g. params.id | result.id */
  entityIdFrom?: string
}

export const Audited = (options: AuditedOptions) => SetMetadata(AUDITED_METADATA_KEY, options)
