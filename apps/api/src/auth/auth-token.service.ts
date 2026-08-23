import { Injectable, UnauthorizedException } from '@nestjs/common'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

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
  tenantId: string
  sid: string
  type: 'access'
  iat: number
  exp: number
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

  signAccessToken(input: AccessTokenInput): string {
    const now = Math.floor(Date.now() / 1000)
    const payload: AccessTokenPayload = {
      sub: input.userId,
      tenantId: input.tenantId,
      sid: input.sessionId,
      type: 'access',
      iat: now,
      exp: now + this.config.accessTokenTtlSeconds,
    }

    const header = this.encodeJson({ alg: 'HS256', typ: 'JWT' })
    const body = this.encodeJson(payload)
    const signature = this.sign(`${header}.${body}`)

    return `${header}.${body}.${signature}`
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    const [header, body, signature] = token.split('.')

    if (!header || !body || !signature) {
      throw new UnauthorizedException('Invalid access token')
    }

    const expected = this.sign(`${header}.${body}`)

    if (!this.safeEqual(signature, expected)) {
      throw new UnauthorizedException('Invalid access token')
    }

    const payload = this.decodeJson<AccessTokenPayload>(body)
    const now = Math.floor(Date.now() / 1000)

    if (payload.type !== 'access' || payload.exp <= now || !payload.sub || !payload.tenantId || !payload.sid) {
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
