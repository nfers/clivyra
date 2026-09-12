import { proxyJson } from '../../../lib/session/api-proxy'

export async function GET(request: Request) {
  return proxyJson(request, '/services')
}

export async function POST(request: Request) {
  const body = await request.text()
  return proxyJson(request, '/services', { method: 'POST', body })
}
