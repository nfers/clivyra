import { Injectable, UnauthorizedException } from '@nestjs/common'
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'

interface AuthTokenConfig {
  accessTokenSecret: string
  accessTokenTtlSeconds: number
  refreshTokenTtlSeconds: number
  passwordResetTtlSeconds: number
}

interface AccessTokenInput {
  userId: string
  tenantId: string
  sessionId: string
}

export interface AccessTokenPayload {
  sub: string
  tid: string
  sid: string
  typ: 'access'
  iat: number
  exp: number
  jti: string
}

@Injectable()
export class AuthTokenService {
  private readonly config: AuthTokenConfig

  constructor(config?: Partial<AuthTokenConfig>) {
    const accessTokenSecret =
      config?.accessTokenSecret ??
      process.env.AUTH_ACCESS_TOKEN_SECRET ??
      'local-development-access-token-secret-change-me'

    if (process.env.NODE_ENV === 'production' && !process.env.AUTH_ACCESS_TOKEN_SECRET && !config?.accessTokenSecret) {
      throw new Error('AUTH_ACCESS_TOKEN_SECRET is required in production')
    }

    this.config = {
      accessTokenSecret,
      accessTokenTtlSeconds: Number(config?.accessTokenTtlSeconds ?? process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS ?? 900),
      refreshTokenTtlSeconds: Number(
        config?.refreshTokenTtlSeconds ?? process.env.AUTH_REFRESH_TOKEN_TTL_SECONDS ?? 604_800,
      ),
      passwordResetTtlSeconds: Number(
        config?.passwordResetTtlSeconds ?? process.env.AUTH_PASSWORD_RESET_TTL_SECONDS ?? 1_800,
      ),
    }
  }

  get accessTokenTtlSeconds(): number {
    return this.config.accessTokenTtlSeconds
  }

  signAccessToken(input: AccessTokenInput): { token: string; expiresAt: Date; iat: number } {
    const now = Math.floor(Date.now() / 1000)
    const payload: AccessTokenPayload = {
      sub: input.userId,
      tid: input.tenantId,
      sid: input.sessionId,
      typ: 'access',
      iat: now,
      exp: now + this.config.accessTokenTtlSeconds,
      jti: randomUUID(),
    }

    const header = this.encodeJson({ alg: 'HS256', typ: 'JWT' })
    const body = this.encodeJson(payload)
    const signature = this.sign(`${header}.${body}`)

    return {
      token: `${header}.${body}.${signature}`,
      expiresAt: new Date(payload.exp * 1000),
      iat: payload.iat,
    }
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    const [headerPart, body, signature] = token.split('.')

    if (!headerPart || !body || !signature) {
      throw new UnauthorizedException('Invalid access token')
    }

    let header: { alg?: string; typ?: string }
    try {
      header = this.decodeJson<{ alg?: string; typ?: string }>(headerPart)
    } catch {
      throw new UnauthorizedException('Invalid access token')
    }

    if (header.alg !== 'HS256') {
      throw new UnauthorizedException('Invalid access token')
    }

    const expected = this.sign(`${headerPart}.${body}`)

    if (!this.safeEqual(signature, expected)) {
      throw new UnauthorizedException('Invalid access token')
    }

    const payload = this.decodeJson<AccessTokenPayload>(body)
    const now = Math.floor(Date.now() / 1000)

    if (payload.typ !== 'access' || payload.exp <= now || !payload.sub || !payload.tid || !payload.sid) {
      throw new UnauthorizedException('Invalid access token')
    }

    return payload
  }

  createOpaqueToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url')
  }

  hashOpaqueToken(token: string): string {
    return createHmac('sha256', this.config.accessTokenSecret).update(token).digest('base64url')
  }

  refreshTokenExpiresAt(): Date {
    return new Date(Date.now() + this.config.refreshTokenTtlSeconds * 1000)
  }

  passwordResetExpiresAt(): Date {
    return new Date(Date.now() + this.config.passwordResetTtlSeconds * 1000)
  }

  private encodeJson(value: unknown): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url')
  }

  private decodeJson<TValue>(value: string): TValue {
    try {
      return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as TValue
    } catch {
      throw new UnauthorizedException('Invalid access token')
    }
  }

  private sign(value: string): string {
    return createHmac('sha256', this.config.accessTokenSecret).update(value).digest('base64url')
  }

  private safeEqual(a: string, b: string): boolean {
    return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))
  }
}
