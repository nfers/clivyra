import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { ACCESS_COOKIE, apiBaseUrl, assertSameOrigin } from '../../../lib/session/cookies'

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

  const url = new URL(path, apiBaseUrl())
  const incoming = new URL(request.url)
  url.search = incoming.search

  const headers: Record<string, string> = {
    authorization: `Bearer ${access}`,
  }
  if (init?.body) headers['content-type'] = 'application/json'

  const response = await fetch(url, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
  })

  const text = await response.text()
  return new NextResponse(text || null, {
    status: response.status,
    headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
  })
}

export async function GET(request: Request) {
  return proxy(request, '/consent-terms')
}

export async function POST(request: Request) {
  const body = await request.text()
  return proxy(request, '/consent-terms', { method: 'POST', body })
}
