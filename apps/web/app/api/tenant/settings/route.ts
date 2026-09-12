import { proxyJson } from '../../../../lib/session/api-proxy'

export async function GET(request: Request) {
  return proxyJson(request, '/tenant/settings')
}

export async function PATCH(request: Request) {
  const body = await request.text()
  return proxyJson(request, '/tenant/settings', { method: 'PATCH', body })
}
