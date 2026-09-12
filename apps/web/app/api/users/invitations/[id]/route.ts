import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { ACCESS_COOKIE, apiBaseUrl, assertSameOrigin } from '../../../../../../lib/session/cookies'

type Params = { params: Promise<{ id: string }> }

async function proxy(request: Request, path: string, init?: RequestInit) {
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
  const response = await fetch(new URL(path, apiBaseUrl()), {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${access}`,
      ...(init?.headers ?? {}),
    },
  })
  const text = await response.text()
  return new NextResponse(text || null, {
    status: response.status,
    headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
  })
}

export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params
  return proxy(request, `/users/invitations/${id}`, { method: 'DELETE' })
}
