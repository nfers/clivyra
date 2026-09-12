export type RetentionCategory =
  | 'CLINICAL_RECORD'
  | 'FINANCIAL'
  | 'CONSENT'
  | 'LEAD'
  | 'AUDIT'
  | 'USER_PROFILE'

export type RetentionDecision = 'ERASE' | 'ANONYMIZE' | 'RETAIN'

export interface RetentionContext {
  readonly subjectHasActiveMembership?: boolean
  readonly now?: Date
}

/**
 * Declarative retention policy (D7 — no purge in P0).
 * Values are initial defaults; tenant overrides are a follow-up.
 *
 * Clinical records: retain ~20 years (CFM/COFFITO guidance) — document only.
 * Audit / consent history: never erased by LGPD erasure flow.
 */
const POLICY: Record<
  RetentionCategory,
  { decision: RetentionDecision; retainYears?: number; reason: string }
> = {
  CLINICAL_RECORD: {
    decision: 'RETAIN',
    retainYears: 20,
    reason: 'Retenção legal de prontuário (orientação CFM/COFFITO ~20 anos)',
  },
  FINANCIAL: {
    decision: 'RETAIN',
    retainYears: 5,
    reason: 'Obrigações fiscais e contábeis (5 anos)',
  },
  CONSENT: {
    decision: 'RETAIN',
    retainYears: 5,
    reason: 'Histórico de consentimento retido enquanto o sujeito existir + 5 anos',
  },
  LEAD: {
    decision: 'ANONYMIZE',
    retainYears: 2,
    reason: 'Lead após 2 anos pode ser anonimizado',
  },
  AUDIT: {
    decision: 'RETAIN',
    reason: 'Trilha de auditoria segue a retenção dos dados auditados (sem purge no P0)',
  },
  USER_PROFILE: {
    decision: 'ANONYMIZE',
    reason: 'Perfil de usuário pode ser anonimizado se não houver vínculo ativo',
  },
}

export function decideRetention(
  category: RetentionCategory,
  context: RetentionContext = {},
): { decision: RetentionDecision; reason: string } {
  if (category === 'USER_PROFILE' && context.subjectHasActiveMembership) {
    return {
      decision: 'RETAIN',
      reason: 'Vínculo ativo em tenant — exclusão/anonimização bloqueada',
    }
  }

  const entry = POLICY[category]
  return { decision: entry.decision, reason: entry.reason }
}

export function retentionCatalog(): typeof POLICY {
  return POLICY
}
