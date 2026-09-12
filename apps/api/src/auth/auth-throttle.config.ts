/** Nest Throttler v6 named limits used by auth routes. */
export const AUTH_THROTTLE = {
  signup: { default: { limit: 3, ttl: 3_600_000 } },
  login: { default: { limit: 20, ttl: 60_000 } },
  refresh: { default: { limit: 30, ttl: 60_000 } },
  logout: { default: { limit: 30, ttl: 60_000 } },
  logoutAll: { default: { limit: 10, ttl: 60_000 } },
  switchTenant: { default: { limit: 10, ttl: 60_000 } },
  passwordResetRequest: { default: { limit: 3, ttl: 900_000 } },
  passwordResetConfirm: { default: { limit: 5, ttl: 900_000 } },
} as const
