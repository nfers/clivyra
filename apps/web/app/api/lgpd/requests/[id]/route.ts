import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { ACCESS_COOKIE, apiBaseUrl, assertSameOrigin } from '../../../../../lib/session/cookies'

type Ctx = { params: Promise<{ id: string }> }

async function authProxy(request: Request, path: string, init?: RequestInit) {
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
      authorization: `Bearer ${access}`,
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
    },
  })
  const text = await response.text()
  return new NextResponse(text || null, {
    status: response.status,
    headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
  })
}

export async function GET(request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  return authProxy(request, `/lgpd/requests/${id}`)
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const body = await request.text()
  return authProxy(request, `/lgpd/requests/${id}`, { method: 'PATCH', body })
}
