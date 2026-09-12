export const AUDIT_ACTIONS = [
  // auth (CLI-12)
  'auth.login.succeeded',
  'auth.login.failed',
  'auth.login.locked',
  'auth.logout',
  'auth.logout_all',
  'auth.session.revoked',
  'auth.tenant.switched',
  'auth.refresh.reuse_detected',
  'auth.password.reset_requested',
  'auth.password.changed',
  // users (CLI-13)
  'users.invitation.created',
  'users.invitation.resent',
  'users.invitation.revoked',
  'users.invitation.accepted',
  'users.role.changed',
  'users.membership.deactivated',
  'users.membership.activated',
  // sistema (CLI-11)
  'system.tenant_bypass',
  // auditoria
  'audit.queried',
  // studio (CLI-16)
  'tenant.settings.updated',
  'tenant.logo.updated',
  'tenant.onboarding.completed',
  'professional.created',
  'professional.updated',
  'professional.linked',
  'professional.unlinked',
  'professional.deactivated',
  'professional.activated',
  'professional.signature.uploaded',
  'professional.signature.deleted',
  'professional.signature.viewed',
  'service.created',
  'service.updated',
  'service.deactivated',
  'room.created',
  'room.updated',
  'room.deactivated',
  'working_hours.updated',
] as const

export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export type AuditOutcome = 'SUCCESS' | 'DENIED' | 'FAILURE'

export interface AuditLogActorView {
  readonly userId: string | null
  readonly name?: string | null
  readonly role?: string | null
}

export interface AuditChangeView {
  readonly field: string
  readonly from: unknown
  readonly to: unknown
}

export interface AuditLogView {
  readonly id: string
  readonly occurredAt: string
  readonly action: AuditAction | string
  readonly entityType: string
  readonly entityId: string | null
  readonly outcome: AuditOutcome
  readonly actor: AuditLogActorView
  readonly requestId: string | null
  readonly metadata: Record<string, unknown> | null
  readonly changes: AuditChangeView[] | null
}

/** Portuguese labels for the audit UI (CLI-14). */
export const AUDIT_ACTION_LABELS_PT: Record<AuditAction, string> = {
  'auth.login.succeeded': 'Login realizado',
  'auth.login.failed': 'Login falhou',
  'auth.login.locked': 'Conta bloqueada',
  'auth.logout': 'Logout',
  'auth.logout_all': 'Logout de todas as sessões',
  'auth.session.revoked': 'Sessão revogada',
  'auth.tenant.switched': 'Studio alterado',
  'auth.refresh.reuse_detected': 'Reuso de refresh detectado',
  'auth.password.reset_requested': 'Reset de senha solicitado',
  'auth.password.changed': 'Senha alterada',
  'users.invitation.created': 'Convite criado',
  'users.invitation.resent': 'Convite reenviado',
  'users.invitation.revoked': 'Convite cancelado',
  'users.invitation.accepted': 'Convite aceito',
  'users.role.changed': 'Papel alterado',
  'users.membership.deactivated': 'Usuário desativado',
  'users.membership.activated': 'Usuário reativado',
  'system.tenant_bypass': 'Bypass de tenant',
  'audit.queried': 'Auditoria consultada',
  'tenant.settings.updated': 'Configurações do studio atualizadas',
  'tenant.logo.updated': 'Logo do studio atualizada',
  'tenant.onboarding.completed': 'Onboarding concluído',
  'professional.created': 'Profissional criado',
  'professional.updated': 'Profissional atualizado',
  'professional.linked': 'Profissional vinculado a usuário',
  'professional.unlinked': 'Vínculo de profissional removido',
  'professional.deactivated': 'Profissional desativado',
  'professional.activated': 'Profissional ativado',
  'professional.signature.uploaded': 'Assinatura enviada',
  'professional.signature.deleted': 'Assinatura removida',
  'professional.signature.viewed': 'Assinatura visualizada',
  'service.created': 'Serviço criado',
  'service.updated': 'Serviço atualizado',
  'service.deactivated': 'Serviço desativado',
  'room.created': 'Sala criada',
  'room.updated': 'Sala atualizada',
  'room.deactivated': 'Sala desativada',
  'working_hours.updated': 'Horários atualizados',
}

export function isAuditAction(value: string): value is AuditAction {
  return (AUDIT_ACTIONS as readonly string[]).includes(value)
}
