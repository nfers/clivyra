import { proxyJson } from '../../../../lib/session/api-proxy'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Params) {
  const { id } = await params
  return proxyJson(request, `/professionals/${id}`)
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params
  const body = await request.text()
  return proxyJson(request, `/professionals/${id}`, { method: 'PATCH', body })
}
