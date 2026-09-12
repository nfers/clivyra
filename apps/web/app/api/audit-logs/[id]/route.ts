import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { ACCESS_COOKIE, apiBaseUrl, assertSameOrigin } from '../../../../lib/session/cookies'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
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

  const { id } = await context.params
  const response = await fetch(new URL(`/audit-logs/${id}`, apiBaseUrl()), {
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${access}`,
    },
  })

  const text = await response.text()
  return new NextResponse(text || null, {
    status: response.status,
    headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
  })
}
