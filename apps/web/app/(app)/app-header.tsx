'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { MeResponse } from '@clivyra/types'
import { Can } from '../../lib/session/SessionProvider'

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
        <nav className="app-nav" aria-label="Principal">
          <Link href="/app">Início</Link>
          <Can permission="settings:read">
            <Link href="/app/configuracoes/studio">Studio</Link>
          </Can>
          <Can permission="professionals:read">
            <Link href="/app/configuracoes/profissionais">Profissionais</Link>
          </Can>
          <Can permission="settings:read">
            <Link href="/app/configuracoes/servicos">Serviços</Link>
          </Can>
          <Can permission="settings:read">
            <Link href="/app/configuracoes/salas">Salas</Link>
          </Can>
          <Can permission="professionals:self">
            <Link href="/app/perfil">Perfil</Link>
          </Can>
          <Can permission="users:read">
            <Link href="/app/configuracoes/usuarios">Usuários</Link>
          </Can>
          <Can permission="audit:read">
            <Link href="/app/configuracoes/auditoria">Auditoria</Link>
          </Can>
        </nav>
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
              {session.memberships.map((item: { tenantId: string; name: string }) => (
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
