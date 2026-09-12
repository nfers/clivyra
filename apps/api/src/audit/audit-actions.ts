import type { AuditAction } from '@clivyra/types'

/**
 * Keys allowed in AuditLog.metadata per action.
 * Actions without an entry only accept empty metadata.
 */
export const AUDIT_METADATA_ALLOWLIST: Record<AuditAction, readonly string[]> = {
  'auth.login.succeeded': ['tenantSlug'],
  'auth.login.failed': [],
  'auth.login.locked': [],
  'auth.logout': ['reason'],
  'auth.logout_all': ['reason'],
  'auth.session.revoked': ['sessionId'],
  'auth.tenant.switched': ['fromTenantId', 'toTenantId', 'toTenantSlug'],
  'auth.refresh.reuse_detected': ['familyId'],
  'auth.password.reset_requested': [],
  'auth.password.changed': [],
  'users.invitation.created': ['email', 'role'],
  'users.invitation.resent': ['email', 'role'],
  'users.invitation.revoked': ['email'],
  'users.invitation.accepted': ['email', 'role'],
  'users.role.changed': ['membershipId'],
  'users.membership.deactivated': ['membershipId'],
  'users.membership.activated': ['membershipId'],
  'system.tenant_bypass': ['reason'],
  'audit.queried': ['filters', 'route', 'method'],
}

/** Clinical-record actions (future) must not allow free-text keys — documented contract. */
export const CLINICAL_RECORD_TEXT_KEYS_FORBIDDEN = [
  'notes',
  'content',
  'text',
  'body',
  'description',
  'evolution',
  'anamnesis',
  'diagnosis',
] as const
