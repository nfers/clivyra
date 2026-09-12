import { createHash } from 'node:crypto'
import type { MembershipRole } from '@prisma/client'
import type { AuditAction } from '@clivyra/types'
import { hashIp, truncateUserAgent } from '../auth/auth-request.util'
import { RequestContextStorage } from '../common/request-context/request-context.storage'
import { TenantContextStorage } from '../tenant/tenant-context.storage'
import { AuditValidationError } from './audit.errors'

export interface ResolvedAuditActor {
  readonly actorType: 'USER' | 'SYSTEM' | 'API_KEY'
  readonly actorUserId: string | null
  readonly actorMembershipId: string | null
  readonly actorRole: MembershipRole | null
  readonly tenantId: string | null
  readonly requestId: string | null
  readonly ipHash: string | null
  readonly userAgent: string | null
  readonly systemReason?: string
}

export function resolveAuditContext(options?: {
  actor?: { type: 'SYSTEM'; reason: string }
  tenantId?: string
}): ResolvedAuditActor {
  if (options?.actor?.type === 'SYSTEM') {
    if (!options.actor.reason?.trim()) {
      throw new AuditValidationError('SYSTEM actor requires reason')
    }
    const request = RequestContextStorage.get()
    return {
      actorType: 'SYSTEM',
      actorUserId: null,
      actorMembershipId: null,
      actorRole: null,
      tenantId: options.tenantId ?? TenantContextStorage.get()?.tenantId ?? null,
      requestId: request?.requestId ?? null,
      ipHash: request?.ip ? (hashIp(request.ip) ?? null) : null,
      userAgent: truncateUserAgent(request?.userAgent) ?? null,
      systemReason: options.actor.reason,
    }
  }

  const tenant = TenantContextStorage.get()
  const request = RequestContextStorage.get()

  if (!tenant && !options?.tenantId) {
    throw new AuditValidationError('Audit actor requires tenant context or SYSTEM actor with tenantId')
  }

  return {
    actorType: 'USER',
    actorUserId: tenant?.userId ?? null,
    actorMembershipId: tenant?.membershipId ?? null,
    actorRole: (tenant?.role as MembershipRole | undefined) ?? null,
    tenantId: options?.tenantId ?? tenant?.tenantId ?? null,
    requestId: request?.requestId ?? null,
    ipHash: request?.ip ? (hashIp(request.ip) ?? null) : null,
    userAgent: truncateUserAgent(request?.userAgent) ?? null,
  }
}

/** Hash IP for structured logs when AuditLog is not written (no tenant). */
export function hashIpForLog(ip: string | undefined): string | undefined {
  return hashIp(ip)
}

export function requireAuditIpHashSalt(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.AUDIT_IP_HASH_SALT?.trim()
  const isProduction = env.NODE_ENV === 'production'
  const defaults = new Set(['local-dev-audit-ip-hash-salt', 'change-me-audit-ip-hash-salt'])

  if (!value) {
    if (isProduction) {
      throw new Error('AUDIT_IP_HASH_SALT is required in production')
    }
    return 'local-dev-audit-ip-hash-salt'
  }

  if (isProduction && defaults.has(value)) {
    throw new Error('AUDIT_IP_HASH_SALT must not use a development default value in production')
  }

  return value
}

export function fingerprintAction(action: AuditAction): string {
  return createHash('sha256').update(action).digest('hex').slice(0, 12)
}
