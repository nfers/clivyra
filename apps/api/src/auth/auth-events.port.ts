export const AUTH_EVENTS_PORT = Symbol('AUTH_EVENTS_PORT')

export interface AuthEventPayload {
  userId?: string
  tenantId?: string
  sessionId?: string
  familyId?: string
  ipHash?: string
  reason?: string
  membershipId?: string
  displayName?: string
  role?: string
  /** When false, only structured log — AuditService already persisted. */
  persist?: boolean
  [key: string]: unknown
}

export interface AuthEventsPort {
  emit(event: string, payload?: AuthEventPayload): void
}

export type AuthEventHandler = (event: string, payload: AuthEventPayload) => void | Promise<void>

const extraHandlers: AuthEventHandler[] = []

/** Register a side-effect handler (e.g. professional draft on invite accept). */
export function registerAuthEventHandler(handler: AuthEventHandler): () => void {
  extraHandlers.push(handler)
  return () => {
    const index = extraHandlers.indexOf(handler)
    if (index >= 0) extraHandlers.splice(index, 1)
  }
}

export function notifyAuthEventHandlers(event: string, payload: AuthEventPayload): void {
  for (const handler of extraHandlers) {
    try {
      void handler(event, payload)
    } catch {
      // Handlers must not break the primary emit path.
    }
  }
}
