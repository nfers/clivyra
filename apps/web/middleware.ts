import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const ACCESS_COOKIE = 'clivyra_at'
const REFRESH_COOKIE = 'clivyra_rt'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (!pathname.startsWith('/app')) {
    return NextResponse.next()
  }

  const hasAccess = Boolean(request.cookies.get(ACCESS_COOKIE)?.value)
  const hasRefresh = Boolean(request.cookies.get(REFRESH_COOKIE)?.value)

  if (!hasAccess && !hasRefresh) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/app/:path*'],
}
