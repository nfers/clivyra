import { cookies } from 'next/headers'
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

  const jar = await cookies()
  const accessToken = jar.get(ACCESS_COOKIE)?.value
  if (!accessToken) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const response = await fetch(`${apiBaseUrl()}/auth/switch-tenant`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-client': 'api',
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    return NextResponse.json(payload ?? { message: 'Unable to switch studio' }, { status: response.status })
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
