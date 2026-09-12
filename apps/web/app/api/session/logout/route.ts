import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  apiBaseUrl,
  assertSameOrigin,
  refreshCookieOptions,
} from '../../../../lib/session/cookies'

export async function POST(request: Request) {
  try {
    assertSameOrigin(request)
  } catch {
    return NextResponse.json({ message: 'Invalid origin' }, { status: 403 })
  }

  const jar = await cookies()
  const refreshToken = jar.get(REFRESH_COOKIE)?.value
  if (refreshToken) {
    await fetch(`${apiBaseUrl()}/auth/logout`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-client': 'api',
      },
      body: JSON.stringify({ refreshToken }),
    })
  }

  const res = new NextResponse(null, { status: 204 })
  res.cookies.set(ACCESS_COOKIE, '', { ...accessCookieOptions(0), maxAge: 0 })
  res.cookies.set(REFRESH_COOKIE, '', { ...refreshCookieOptions(), maxAge: 0 })
  return res
}
