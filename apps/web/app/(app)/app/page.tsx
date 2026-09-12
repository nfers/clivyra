'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { usePermissions } from '../../../lib/session/SessionProvider'

export default function AppHomePage() {
  const router = useRouter()
  const { can } = usePermissions()

  useEffect(() => {
    if (!can('settings:write')) return
    void (async () => {
      const response = await fetch('/api/tenant/onboarding')
      if (!response.ok) return
      const body = (await response.json()) as { completed: boolean }
      if (!body.completed) router.replace('/onboarding')
    })()
  }, [can, router])

  return (
    <section className="app-home" aria-labelledby="app-home-title">
      <h2 id="app-home-title">Bem-vindo</h2>
      <p>O painel do studio está pronto. Configure profissionais, salas e horários nas configurações.</p>
      <nav className="app-nav" aria-label="Atalhos">
        <Link href="/app/configuracoes/studio">Studio</Link>
        <Link href="/app/configuracoes/profissionais">Profissionais</Link>
        <Link href="/app/configuracoes/servicos">Serviços</Link>
        <Link href="/app/configuracoes/salas">Salas</Link>
        <Link href="/app/perfil">Meu perfil</Link>
      </nav>
    </section>
  )
}
