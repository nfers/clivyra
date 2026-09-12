import { assertAuthBootConfig, requireEnv } from '@clivyra/config'

describe('auth boot config', () => {
  const original = { ...process.env }

  afterEach(() => {
    process.env = { ...original }
  })

  it('fails when AUTH_EXPOSE_RESET_TOKEN is true in production', () => {
    process.env.NODE_ENV = 'production'
    process.env.AUTH_EXPOSE_RESET_TOKEN = 'true'
    process.env.AUTH_ACCESS_TOKEN_SECRET = 'production-secret-with-enough-length-123456'
    process.env.AUTH_PASSWORD_PEPPER = 'production-pepper-with-enough-length-123456'
    process.env.AUTH_COOKIE_SECURE = 'true'

    expect(() => assertAuthBootConfig(process.env)).toThrow(/AUTH_EXPOSE_RESET_TOKEN/)
  })

  it('rejects development default secrets in production', () => {
    process.env.NODE_ENV = 'production'
    process.env.AUTH_EXPOSE_RESET_TOKEN = 'false'
    process.env.AUTH_ACCESS_TOKEN_SECRET = 'change-me-access-token-secret-at-least-32-chars'
    process.env.AUTH_PASSWORD_PEPPER = 'production-pepper-with-enough-length-123456'
    process.env.AUTH_COOKIE_SECURE = 'true'

    expect(() => requireEnv('AUTH_ACCESS_TOKEN_SECRET', { production: true, minLength: 32 })).toThrow(
      /development default/,
    )
  })
})
