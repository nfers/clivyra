const DEV_DEFAULT_SECRETS = new Set([
  'local-development-access-token-secret-change-me',
  'local-development-password-pepper-change-me',
  'change-me-access-token-secret-at-least-32-chars',
  'change-me-password-pepper-at-least-32-chars',
])

export function requireEnv(
  name: string,
  options: { production?: boolean; minLength?: number; disallowDefaults?: boolean } = {},
  env: NodeJS.ProcessEnv = process.env,
): string {
  const value = env[name]?.trim() || undefined
  const isProduction = env.NODE_ENV === 'production'
  const required = options.production === true ? isProduction : true

  if (!value) {
    if (required) {
      throw new Error(`${name} is required`)
    }
    return ''
  }

  if (options.minLength && value.length < options.minLength) {
    throw new Error(`${name} must be at least ${options.minLength} characters`)
  }

  if ((options.disallowDefaults ?? isProduction) && DEV_DEFAULT_SECRETS.has(value)) {
    throw new Error(`${name} must not use a development default value`)
  }

  return value
}

export function assertAuthBootConfig(env: NodeJS.ProcessEnv = process.env): void {
  const isProduction = env.NODE_ENV === 'production'

  if (env.AUTH_EXPOSE_RESET_TOKEN === 'true' && isProduction) {
    throw new Error('AUTH_EXPOSE_RESET_TOKEN must not be true in production')
  }

  if (isProduction) {
    requireEnv('AUTH_ACCESS_TOKEN_SECRET', { production: true, minLength: 32, disallowDefaults: true }, env)
    requireEnv('AUTH_PASSWORD_PEPPER', { production: true, minLength: 32, disallowDefaults: true }, env)

    if (env.AUTH_COOKIE_SECURE !== 'true') {
      throw new Error('AUTH_COOKIE_SECURE must be true in production')
    }
  }
}
