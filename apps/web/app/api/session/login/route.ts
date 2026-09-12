import { NextResponse } from 'next/server'
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  apiBaseUrl,
  assertSameOrigin,
  refreshCookieOptions,
  type AuthSessionResponse,
} from '../../../../lib/session/cookies'

export async function POST(request: Request) {
  try {
    assertSameOrigin(request)
  } catch {
    return NextResponse.json({ message: 'Invalid origin' }, { status: 403 })
  }

  const body = await request.json()
  const response = await fetch(`${apiBaseUrl()}/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-client': 'api',
    },
    body: JSON.stringify(body),
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    return NextResponse.json(payload ?? { message: 'Login failed' }, { status: response.status })
  }

  const session = payload as AuthSessionResponse
  const res = NextResponse.json({
    user: session.user,
    tenant: session.tenant,
    membership: session.membership,
    accessTokenExpiresAt: session.accessTokenExpiresAt,
  })

  const maxAge = Math.max(
    60,
    Math.floor((new Date(session.accessTokenExpiresAt).getTime() - Date.now()) / 1000),
  )
  res.cookies.set(ACCESS_COOKIE, session.accessToken, accessCookieOptions(maxAge))
  if (session.refreshToken) {
    res.cookies.set(REFRESH_COOKIE, session.refreshToken, refreshCookieOptions())
  }
  return res
}
