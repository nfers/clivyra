import { createHash } from 'node:crypto'

export function hashIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined
  const salt = process.env.AUDIT_IP_HASH_SALT ?? 'local-dev-audit-ip-hash-salt'
  return createHash('sha256').update(`${ip}.${salt}`).digest('hex')
}

export function truncateUserAgent(value: string | undefined, max = 256): string | undefined {
  if (!value) return undefined
  return value.length <= max ? value : value.slice(0, max)
}

export function clientIp(request: {
  ip?: string
  headers?: Record<string, string | string[] | undefined>
  socket?: { remoteAddress?: string }
}): string | undefined {
  const forwarded = request.headers?.['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim()
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].split(',')[0]?.trim()
  }
  return request.ip ?? request.socket?.remoteAddress
}
