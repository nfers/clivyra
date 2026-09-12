import { proxyMultipart } from '../../../../../lib/session/api-proxy'

export async function POST(request: Request) {
  return proxyMultipart(request, '/tenant/settings/logo')
}
