import type { AuthSessionResponse, MeResponse } from '@clivyra/types'

export const ACCESS_COOKIE = 'clivyra_at'
export const REFRESH_COOKIE = 'clivyra_rt'

export function apiBaseUrl(): string {
  return process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3001'
}

export function accessCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.AUTH_COOKIE_SECURE === 'true',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
    domain: process.env.AUTH_COOKIE_DOMAIN || undefined,
  }
}

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.AUTH_COOKIE_SECURE === 'true',
    sameSite: 'lax' as const,
    path: '/api/session',
    maxAge: 60 * 60 * 24 * 7,
    domain: process.env.AUTH_COOKIE_DOMAIN || undefined,
  }
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  if (!host) {
    throw new Error('Missing host')
  }
  // Browser mutations always send Origin; server-side cookie refresh may omit it.
  if (!origin) {
    return
  }
  const expected = new URL(origin)
  if (expected.host !== host) {
    throw new Error('Invalid origin')
  }
}


export type { AuthSessionResponse, MeResponse }
