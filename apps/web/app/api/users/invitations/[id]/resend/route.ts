import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { ACCESS_COOKIE, apiBaseUrl, assertSameOrigin } from '../../../../../../lib/session/cookies'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
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
  const { id } = await params
  const response = await fetch(new URL(`/users/invitations/${id}/resend`, apiBaseUrl()), {
    method: 'POST',
    headers: { authorization: `Bearer ${access}` },
  })
  return new NextResponse(null, { status: response.status })
}
