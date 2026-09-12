'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { AuthPermissionsResponse, MeResponse, Permission } from '@clivyra/types'
import { hasPermission } from '@clivyra/types'

interface SessionState {
  session: MeResponse | null
  permissions: AuthPermissionsResponse | null
  refreshPermissions: () => Promise<void>
}

const SessionContext = createContext<SessionState>({
  session: null,
  permissions: null,
  refreshPermissions: async () => undefined,
})

export function SessionProvider({
  initial,
  children,
}: {
  initial: MeResponse | null
  children: ReactNode
}) {
  const [session] = useState(initial)
  const [permissions, setPermissions] = useState<AuthPermissionsResponse | null>(null)

  const refreshPermissions = useCallback(async () => {
    if (!session) {
      setPermissions(null)
      return
    }
    const response = await fetch('/api/auth/permissions')
    if (!response.ok) {
      setPermissions(null)
      return
    }
    const payload = (await response.json()) as AuthPermissionsResponse
    setPermissions(payload)
  }, [session])

  useEffect(() => {
    void refreshPermissions()
  }, [refreshPermissions])

  const value = useMemo(
    () => ({ session, permissions, refreshPermissions }),
    [session, permissions, refreshPermissions],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): MeResponse | null {
  return useContext(SessionContext).session
}

export function usePermissions() {
  const { permissions, refreshPermissions } = useContext(SessionContext)
  const can = useCallback(
    (permission: Permission) => {
      if (!permissions) return false
      return hasPermission(permissions.role, permission)
    },
    [permissions],
  )
  return {
    role: permissions?.role ?? null,
    permissions: permissions?.permissions ?? [],
    can,
    refreshPermissions,
  }
}

export function Can({
  permission,
  children,
}: {
  permission: Permission
  children: ReactNode
}) {
  const { can } = usePermissions()
  if (!can(permission)) return null
  return <>{children}</>
}
