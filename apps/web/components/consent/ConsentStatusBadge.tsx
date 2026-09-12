'use client'

import type { ConsentStatusKind } from '@clivyra/types'

const LABELS: Record<ConsentStatusKind, string> = {
  ACTIVE: 'Ativo',
  NEEDS_RENEWAL: 'Precisa renovar',
  REVOKED: 'Revogado',
  MISSING: 'Ausente',
  EXPIRED: 'Expirado',
}

const TONES: Record<ConsentStatusKind, string> = {
  ACTIVE: 'consent-badge--active',
  NEEDS_RENEWAL: 'consent-badge--renewal',
  REVOKED: 'consent-badge--revoked',
  MISSING: 'consent-badge--missing',
  EXPIRED: 'consent-badge--expired',
}

export function ConsentStatusBadge({ status }: { status: ConsentStatusKind }) {
  return (
    <span className={`consent-badge ${TONES[status]}`} data-status={status}>
      {LABELS[status]}
    </span>
  )
}
