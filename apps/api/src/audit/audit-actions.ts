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
  'consent.term.created': ['termId', 'type'],
  'consent.term.published': ['termId', 'type', 'version', 'requiresReconsent'],
  'consent.term.retired': ['termId', 'type', 'version'],
  'consent.granted': ['recordId', 'termId', 'termType', 'subjectType', 'source'],
  'consent.revoked': ['recordId', 'supersedesId', 'termType', 'subjectType'],
  'consent.renewed': ['recordId', 'supersedesId', 'termId', 'termType', 'subjectType'],
  'lgpd.request.opened': ['requestId', 'type', 'subjectType'],
  'lgpd.request.updated': ['requestId', 'status'],
  'lgpd.request.executed': ['requestId', 'type'],
  'lgpd.request.completed': ['requestId', 'type'],
  'lgpd.request.rejected': ['requestId', 'type'],
  'lgpd.data.exported': ['requestId', 'sections'],
  'lgpd.data.anonymized': ['requestId', 'module', 'strategy', 'affected'],
  'lgpd.data.retained': ['requestId', 'module', 'category', 'reason'],
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
