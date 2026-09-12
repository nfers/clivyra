import { proxyJson } from '../../../lib/session/api-proxy'

export async function GET(request: Request) {
  return proxyJson(request, '/working-hours')
}

export async function PUT(request: Request) {
  const body = await request.text()
  return proxyJson(request, '/working-hours', { method: 'PUT', body })
}
