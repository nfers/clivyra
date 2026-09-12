import type { AuditAction } from '@clivyra/types'
import { AUDIT_METADATA_ALLOWLIST } from './audit-actions'
import { AppLogger } from '../common/logging/app-logger.service'
import { AuditValidationError } from './audit.errors'

const DENYLIST = new Set(
  [
    'password',
    'passwordhash',
    'token',
    'refreshtoken',
    'accesstoken',
    'secret',
    'authorization',
    'cookie',
    'pepper',
    'hash',
    'otp',
    'cpf',
    'rg',
    'cardnumber',
    'cvv',
  ].map((key) => key.toLowerCase()),
)

const MAX_STRING = 512
const MAX_BYTES = 8 * 1024

const logger = new AppLogger()

function isDeniedKey(key: string): boolean {
  return DENYLIST.has(key.toLowerCase())
}

function truncateString(value: string): string {
  return value.length <= MAX_STRING ? value : `${value.slice(0, MAX_STRING)}…`
}

function redactDeep(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return truncateString(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map((item) => redactDeep(item))
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isDeniedKey(key) ? '[REDACTED]' : redactDeep(nested)
    }
    return out
  }
  return String(value)
}

function byteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value ?? null), 'utf8')
}

function enforceSize(metadata: Record<string, unknown>): Record<string, unknown> {
  if (byteLength(metadata) <= MAX_BYTES) return metadata
  const trimmed: Record<string, unknown> = { _truncated: true }
  for (const [key, value] of Object.entries(metadata)) {
    const candidate = { ...trimmed, [key]: value }
    if (byteLength(candidate) > MAX_BYTES) break
    trimmed[key] = value
  }
  return trimmed
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain || !local) return '***'
  const visible = local.slice(0, Math.min(2, local.length))
  return `${visible}***@${domain}`
}

export function maskDocument(value: string): string {
  if (value.length <= 4) return '****'
  return `${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`
}

export interface SanitizeResult {
  metadata: Record<string, unknown> | null
  droppedKeys: string[]
}

export function sanitizeMetadata(
  action: AuditAction,
  metadata: Record<string, unknown> | undefined,
  options: { strict?: boolean } = {},
): SanitizeResult {
  if (!metadata || Object.keys(metadata).length === 0) {
    return { metadata: null, droppedKeys: [] }
  }

  const allowlist = AUDIT_METADATA_ALLOWLIST[action] ?? []
  const droppedKeys: string[] = []
  const filtered: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(metadata)) {
    if (isDeniedKey(key)) {
      droppedKeys.push(key)
      continue
    }
    if (!allowlist.includes(key)) {
      droppedKeys.push(key)
      continue
    }
    filtered[key] = redactDeep(value)
  }

  if (droppedKeys.length > 0) {
    logger.warn('audit.sanitizer.dropped_keys', {
      metric: 'audit.sanitizer.dropped_keys',
      action,
      droppedKeys,
    })
    if (options.strict ?? process.env.NODE_ENV === 'test') {
      throw new AuditValidationError(
        `Audit metadata keys not allowed for ${action}: ${droppedKeys.join(', ')}`,
      )
    }
  }

  const sized = enforceSize(filtered)
  return {
    metadata: Object.keys(sized).length > 0 ? sized : null,
    droppedKeys,
  }
}

export interface ChangeInput {
  before?: object
  after?: object
  fields: string[]
  maskFields?: string[]
}

export function buildChanges(input: ChangeInput): Array<{ field: string; from: unknown; to: unknown }> | null {
  const before = (input.before ?? {}) as Record<string, unknown>
  const after = (input.after ?? {}) as Record<string, unknown>
  const mask = new Set(input.maskFields ?? [])
  const changes: Array<{ field: string; from: unknown; to: unknown }> = []

  for (const field of input.fields) {
    let from = before[field]
    let to = after[field]
    if (isDeniedKey(field)) {
      from = '[REDACTED]'
      to = '[REDACTED]'
    } else if (mask.has(field)) {
      from = typeof from === 'string' ? maskDocument(from) : from
      to = typeof to === 'string' ? maskDocument(to) : to
    } else {
      from = redactDeep(from)
      to = redactDeep(to)
    }
    if (JSON.stringify(from) === JSON.stringify(to)) continue
    changes.push({ field, from, to })
  }

  return changes.length > 0 ? changes : null
}

/** Property helper: after sanitize, no denylist key survives with a non-redacted value. */
export function assertNoSensitiveValues(value: unknown): void {
  if (value === null || value === undefined) return
  if (Array.isArray(value)) {
    value.forEach(assertNoSensitiveValues)
    return
  }
  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (isDeniedKey(key) && nested !== '[REDACTED]') {
        throw new Error(`Sensitive key ${key} survived sanitization`)
      }
      assertNoSensitiveValues(nested)
    }
  }
}
