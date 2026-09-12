import { Injectable } from '@nestjs/common'
import { AppLogger } from '../common/logging/app-logger.service'
import type { AuthEventPayload, AuthEventsPort } from '../auth/auth-events.port'
import { TenantContextStorage } from '../tenant/tenant-context.storage'
import { AuditService } from './audit.service'
import { maskEmail } from './audit-sanitizer'
import type { AuditAction, AuditOutcome } from '@clivyra/types'

interface MappedEvent {
  action: AuditAction
  entityType: string
  entityId?: string
  outcome?: AuditOutcome
  metadata?: Record<string, unknown>
  changes?: { before?: object; after?: object; fields: string[] }
  tenantId?: string
}

function compactMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata) return undefined
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined) out[key] = value
  }
  return Object.keys(out).length > 0 ? out : undefined
}

const EMAIL_LOG_KEYS = new Set(['email', 'inviteeemail', 'to'])

/** Structured-log view of an auth event — never plaintext email. */
function sanitizePayloadForLog(payload: AuthEventPayload): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue
    if (EMAIL_LOG_KEYS.has(key.toLowerCase()) && typeof value === 'string') {
      out[key] = maskEmail(value)
      continue
    }
    out[key] = value
  }
  return out
}

const pendingWrites: Promise<unknown>[] = []

/** Await in-flight audit writes (integration fixtures). */
export async function flushPendingAuthAuditWrites(): Promise<void> {
  await Promise.allSettled(pendingWrites.splice(0, pendingWrites.length))
}

@Injectable()
export class AuthEventsAuditAdapter implements AuthEventsPort {
  private readonly logger = new AppLogger()

  constructor(private readonly audit: AuditService) {}

  emit(event: string, payload: AuthEventPayload = {}): void {
    this.logger.log(event, {
      metric: event,
      ...sanitizePayloadForLog(payload),
    })

    if (payload.persist === false) return

    const mapped = this.mapEvent(event, payload)
    if (!mapped) return

    const write = this.audit.recordAccess({
      action: mapped.action,
      entityType: mapped.entityType,
      entityId: mapped.entityId,
      outcome: mapped.outcome,
      metadata: compactMetadata(mapped.metadata),
      changes: mapped.changes,
      tenantId: mapped.tenantId,
    })
    pendingWrites.push(write)
    void write.finally(() => {
      const index = pendingWrites.indexOf(write)
      if (index >= 0) pendingWrites.splice(index, 1)
    })
  }

  private mapEvent(event: string, payload: AuthEventPayload): MappedEvent | null {
    const tenantId =
      (typeof payload.tenantId === 'string' ? payload.tenantId : undefined) ??
      TenantContextStorage.get()?.tenantId

    switch (event) {
      case 'auth.login.succeeded':
        if (!tenantId) return null
        return {
          action: 'auth.login.succeeded',
          entityType: 'User',
          entityId: typeof payload.userId === 'string' ? payload.userId : undefined,
          tenantId,
          metadata: {
            tenantSlug: typeof payload.tenantSlug === 'string' ? payload.tenantSlug : undefined,
          },
        }
      case 'auth.login.failed': {
        // Only persist when tenant is known (existing user with unique membership).
        if (!tenantId) return null
        return {
          action: 'auth.login.failed',
          entityType: 'User',
          entityId: typeof payload.userId === 'string' ? payload.userId : undefined,
          outcome: 'FAILURE',
          tenantId,
        }
      }
      case 'auth.login.locked':
        if (!tenantId) return null
        return {
          action: 'auth.login.locked',
          entityType: 'User',
          entityId: typeof payload.userId === 'string' ? payload.userId : undefined,
          outcome: 'DENIED',
          tenantId,
        }
      case 'auth.logout':
        if (!tenantId) return null
        if (payload.reason === 'logout_all') {
          return {
            action: 'auth.logout_all',
            entityType: 'User',
            entityId: typeof payload.userId === 'string' ? payload.userId : undefined,
            tenantId,
            metadata: { reason: 'logout_all' },
          }
        }
        return {
          action: 'auth.logout',
          entityType: 'RefreshSession',
          entityId: typeof payload.sessionId === 'string' ? payload.sessionId : undefined,
          tenantId,
          metadata: typeof payload.reason === 'string' ? { reason: payload.reason } : undefined,
        }
      case 'auth.session.revoked':
        if (!tenantId) return null
        return {
          action: 'auth.session.revoked',
          entityType: 'RefreshSession',
          entityId: typeof payload.sessionId === 'string' ? payload.sessionId : undefined,
          tenantId,
          metadata: {
            sessionId: typeof payload.sessionId === 'string' ? payload.sessionId : undefined,
          },
        }
      case 'auth.tenant.switched':
        if (!tenantId) return null
        return {
          action: 'auth.tenant.switched',
          entityType: 'Membership',
          entityId: typeof payload.membershipId === 'string' ? payload.membershipId : undefined,
          tenantId,
          metadata: {
            fromTenantId: typeof payload.fromTenantId === 'string' ? payload.fromTenantId : undefined,
            toTenantId: typeof payload.toTenantId === 'string' ? payload.toTenantId : undefined,
            toTenantSlug: typeof payload.toTenantSlug === 'string' ? payload.toTenantSlug : undefined,
          },
        }
      case 'auth.refresh.reuse_detected':
        if (!tenantId) return null
        return {
          action: 'auth.refresh.reuse_detected',
          entityType: 'RefreshSession',
          entityId: typeof payload.sessionId === 'string' ? payload.sessionId : undefined,
          outcome: 'DENIED',
          tenantId,
          metadata: {
            familyId: typeof payload.familyId === 'string' ? payload.familyId : undefined,
          },
        }
      case 'auth.password.reset_requested':
        if (!tenantId) return null
        return {
          action: 'auth.password.reset_requested',
          entityType: 'User',
          entityId: typeof payload.userId === 'string' ? payload.userId : undefined,
          tenantId,
        }
      case 'auth.password.changed':
        if (!tenantId) return null
        return {
          action: 'auth.password.changed',
          entityType: 'User',
          entityId: typeof payload.userId === 'string' ? payload.userId : undefined,
          tenantId,
        }
      case 'users.invitation.created':
      case 'users.invitation.resent':
      case 'users.invitation.revoked':
      case 'users.invitation.accepted':
        if (!tenantId) return null
        return {
          action: event,
          entityType: 'Invitation',
          entityId: typeof payload.invitationId === 'string' ? payload.invitationId : undefined,
          tenantId,
          metadata: {
            email:
              typeof payload.email === 'string' ? maskEmail(payload.email) : undefined,
            role: typeof payload.role === 'string' ? payload.role : undefined,
          },
        }
      case 'users.role.changed':
        if (!tenantId) return null
        return {
          action: 'users.role.changed',
          entityType: 'Membership',
          entityId: typeof payload.membershipId === 'string' ? payload.membershipId : undefined,
          tenantId,
          metadata: {
            membershipId: typeof payload.membershipId === 'string' ? payload.membershipId : undefined,
          },
          changes:
            typeof payload.fromRole === 'string' && typeof payload.toRole === 'string'
              ? {
                  before: { role: payload.fromRole },
                  after: { role: payload.toRole },
                  fields: ['role'],
                }
              : undefined,
        }
      case 'users.membership.deactivated':
      case 'users.membership.activated':
        if (!tenantId) return null
        return {
          action: event,
          entityType: 'Membership',
          entityId: typeof payload.membershipId === 'string' ? payload.membershipId : undefined,
          tenantId,
          metadata: {
            membershipId: typeof payload.membershipId === 'string' ? payload.membershipId : undefined,
          },
        }
      default:
        return null
    }
  }
}
