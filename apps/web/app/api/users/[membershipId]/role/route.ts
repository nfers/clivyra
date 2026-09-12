import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { ACCESS_COOKIE, apiBaseUrl, assertSameOrigin } from '../../../../../../lib/session/cookies'

type Params = { params: Promise<{ membershipId: string }> }

export async function PATCH(request: Request, { params }: Params) {
  try {
    assertSameOrigin(request)
  } catch {
    return NextResponse.json({ message: 'Invalid origin' }, { status: 403 })
  }
  const jar = await cookies()
  const access = jar.get(ACCESS_COOKIE)?.value
  if (!access) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }
  const { membershipId } = await params
  const body = await request.text()
  const response = await fetch(new URL(`/users/${membershipId}/role`, apiBaseUrl()), {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${access}`,
    },
    body,
  })
  const text = await response.text()
  return new NextResponse(text || null, {
    status: response.status,
    headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
  })
}
