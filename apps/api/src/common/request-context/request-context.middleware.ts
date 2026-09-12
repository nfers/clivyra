import { Injectable, NestMiddleware } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { TenantContextStorage } from '../../tenant/tenant-context.storage'
import { RequestContextStorage } from './request-context.storage'
import type { RequestContext } from './request-context.types'

export const REQUEST_ID_HEADER = 'x-request-id'
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/
const MAX_USER_AGENT_LENGTH = 256

export function resolveRequestId(headerValue: string | string[] | undefined): string {
  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue
  if (typeof raw === 'string' && REQUEST_ID_PATTERN.test(raw)) {
    return raw
  }
  return randomUUID()
}

export function truncateUserAgent(userAgent: string | undefined): string | undefined {
  if (!userAgent) {
    return undefined
  }
  return userAgent.length > MAX_USER_AGENT_LENGTH ? userAgent.slice(0, MAX_USER_AGENT_LENGTH) : userAgent
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = resolveRequestId(req.headers[REQUEST_ID_HEADER])
    const context: RequestContext = {
      requestId,
      ip: req.ip,
      userAgent: truncateUserAgent(req.headers['user-agent']),
    }

    res.setHeader(REQUEST_ID_HEADER, requestId)

    // enterWith (not run) so Nest async guards/handlers stay in the same store.
    RequestContextStorage.enterWith(context)
    res.on('finish', () => TenantContextStorage.clear(requestId))
    next()
  }
}
