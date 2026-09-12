import type { AuthSessionResponse } from '@clivyra/types'
import type { AuthenticatedPrincipal } from '@clivyra/types'

export type { AuthenticatedPrincipal }

export interface RequestWithAuth {
  user?: AuthenticatedPrincipal
  headers: Record<string, string | string[] | undefined>
  ip?: string
  socket?: { remoteAddress?: string }
}

export type SessionClientKind = 'api' | 'web'

export function resolveClientKind(headers: RequestWithAuth['headers']): SessionClientKind {
  const raw = headers['x-client']
  const value = Array.isArray(raw) ? raw[0] : raw
  return value?.toLowerCase() === 'api' ? 'api' : 'web'
}

export type AuthenticatedSessionResponse = AuthSessionResponse
