export const AUTH_EVENTS_PORT = Symbol('AUTH_EVENTS_PORT')

export interface AuthEventPayload {
  userId?: string
  tenantId?: string
  sessionId?: string
  familyId?: string
  ipHash?: string
  reason?: string
  [key: string]: unknown
}

export interface AuthEventsPort {
  emit(event: string, payload?: AuthEventPayload): void
}
