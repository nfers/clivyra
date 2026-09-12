'use client'

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { MeResponse } from '@clivyra/types'

const SessionContext = createContext<MeResponse | null>(null)

export function SessionProvider({
  initial,
  children,
}: {
  initial: MeResponse | null
  children: ReactNode
}) {
  const [session] = useState(initial)
  const value = useMemo(() => session, [session])
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): MeResponse | null {
  return useContext(SessionContext)
}
