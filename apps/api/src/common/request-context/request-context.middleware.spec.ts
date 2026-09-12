import type { NextFunction, Request, Response } from 'express'
import {
  REQUEST_ID_HEADER,
  RequestContextMiddleware,
  resolveCorrelationId,
  truncateUserAgent,
} from './request-context.middleware'
import { RequestContextStorage } from './request-context.storage'

describe('RequestContextMiddleware', () => {
  it('accepts valid X-Request-Id for correlation and regenerates invalid ones', () => {
    expect(resolveCorrelationId('abc12345')).toBe('abc12345')
    expect(resolveCorrelationId('bad id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })

  it('truncates user-agent to 256 chars', () => {
    const long = 'x'.repeat(300)
    expect(truncateUserAgent(long)?.length).toBe(256)
  })

  it('echoes client correlation id but stores an internal scopeId for maps', () => {
    const middleware = new RequestContextMiddleware()
    const req = {
      headers: { [REQUEST_ID_HEADER]: 'req-12345', 'user-agent': 'jest' },
      ip: '127.0.0.1',
    } as unknown as Request
    const headers: Record<string, string> = {}
    const res = {
      setHeader: (key: string, value: string) => {
        headers[key] = value
      },
      on: jest.fn(),
    } as unknown as Response

    let scopeId: string | undefined
    let requestId: string | undefined
    const next: NextFunction = () => {
      scopeId = RequestContextStorage.get()?.scopeId
      requestId = RequestContextStorage.get()?.requestId
    }

    middleware.use(req, res, next)

    expect(requestId).toBe('req-12345')
    expect(headers[REQUEST_ID_HEADER]).toBe('req-12345')
    expect(scopeId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
    expect(scopeId).not.toBe('req-12345')
  })
})
