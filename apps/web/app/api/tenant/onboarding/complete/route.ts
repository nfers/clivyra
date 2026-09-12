import { proxyJson } from '../../../../../lib/session/api-proxy'

export async function POST(request: Request) {
  return proxyJson(request, '/tenant/onboarding/complete', { method: 'POST' })
}
