import { proxyJson } from '../../../../lib/session/api-proxy'

export async function GET(request: Request) {
  return proxyJson(request, '/tenant/onboarding')
}
