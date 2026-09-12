import { cookies } from 'next/headers'
import type { AuthSessionResponse, MeResponse } from '@clivyra/types'
import { ACCESS_COOKIE, REFRESH_COOKIE, apiBaseUrl } from './cookies'

export async function getAccessToken(): Promise<string | undefined> {
  const jar = await cookies()
  return jar.get(ACCESS_COOKIE)?.value
}

export async function getRefreshToken(): Promise<string | undefined> {
  const jar = await cookies()
  return jar.get(REFRESH_COOKIE)?.value
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const accessToken = await getAccessToken()
  const headers = new Headers(init.headers)
  headers.set('content-type', headers.get('content-type') ?? 'application/json')
  headers.set('x-client', 'api')
  if (accessToken) {
    headers.set('authorization', `Bearer ${accessToken}`)
  }

  let response = await fetch(`${apiBaseUrl()}${path}`, { ...init, headers, cache: 'no-store' })

  if (response.status === 401 && (await getRefreshToken())) {
    const refreshResponse = await fetch(`${process.env.WEB_ORIGIN ?? 'http://127.0.0.1:3000'}/api/session/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      cache: 'no-store',
    })
    if (refreshResponse.ok) {
      const jar = await cookies()
      const newAccess = jar.get(ACCESS_COOKIE)?.value
      if (newAccess) {
        headers.set('authorization', `Bearer ${newAccess}`)
        response = await fetch(`${apiBaseUrl()}${path}`, { ...init, headers, cache: 'no-store' })
      }
    }
  }

  return response
}

export async function getSession(): Promise<MeResponse | null> {
  const response = await apiFetch('/auth/me')
  if (!response.ok) return null
  return (await response.json()) as MeResponse
}

export type SessionPayload = AuthSessionResponse
