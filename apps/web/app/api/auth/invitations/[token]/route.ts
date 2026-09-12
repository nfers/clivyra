import { NextResponse } from 'next/server'
import { apiBaseUrl } from '../../../../../lib/session/cookies'

type Params = { params: Promise<{ token: string }> }

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params
  const response = await fetch(new URL(`/auth/invitations/${encodeURIComponent(token)}`, apiBaseUrl()))
  const text = await response.text()
  return new NextResponse(text || null, {
    status: response.status,
    headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
  })
}
