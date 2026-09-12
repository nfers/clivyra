'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { MeResponse } from '@clivyra/types'

export function AppHeader({ session }: { session: MeResponse }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [tenantId, setTenantId] = useState(session.tenant.id)

  async function logout() {
    setPending(true)
    await fetch('/api/session/logout', { method: 'POST' })
    router.replace('/login')
    router.refresh()
  }

  async function switchTenant(nextTenantId: string) {
    setTenantId(nextTenantId)
    setPending(true)
    const response = await fetch('/api/session/switch-tenant', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tenantId: nextTenantId }),
    })
    setPending(false)
    if (response.ok) {
      router.refresh()
    }
  }

  return (
    <header className="app-header">
      <div>
        <p className="eyebrow">Clivyra</p>
        <h1>{session.tenant.name}</h1>
        <p className="auth-lead">{session.user.name}</p>
      </div>
      <div className="app-header-actions">
        {session.memberships.length > 1 ? (
          <label className="tenant-switch">
            <span>Studio</span>
            <select
              value={tenantId}
              disabled={pending}
              onChange={(event) => void switchTenant(event.target.value)}
            >
              {session.memberships.map((item) => (
                <option key={item.tenantId} value={item.tenantId}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button type="button" className="ghost-button" disabled={pending} onClick={() => void logout()}>
          Sair
        </button>
      </div>
    </header>
  )
}
