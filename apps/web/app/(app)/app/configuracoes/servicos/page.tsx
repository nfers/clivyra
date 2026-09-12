'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import type { ServiceView } from '@clivyra/types'
import { usePermissions } from '../../../../../lib/session/SessionProvider'

export default function ServicesSettingsPage() {
  const { can } = usePermissions()
  const [rows, setRows] = useState<ServiceView[]>([])
  const [name, setName] = useState('')
  const [durationMinutes, setDurationMinutes] = useState(50)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const response = await fetch('/api/services')
    if (!response.ok) {
      setError('Não foi possível carregar serviços.')
      return
    }
    setRows((await response.json()) as ServiceView[])
  }

  useEffect(() => {
    void load()
  }, [])

  if (!can('settings:read')) {
    return (
      <section className="settings-page">
        <h2>Acesso negado</h2>
        <Link href="/app">Voltar</Link>
      </section>
    )
  }

  async function create(event: FormEvent) {
    event.preventDefault()
    if (!can('settings:write')) return
    const response = await fetch('/api/services', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, durationMinutes }),
    })
    if (!response.ok) {
      setError('Falha ao criar serviço.')
      return
    }
    setName('')
    await load()
  }

  return (
    <section className="settings-page" aria-labelledby="services-title">
      <h2 id="services-title">Serviços</h2>
      <p>
        <Link href="/app">Voltar</Link>
      </p>
      {error ? <p role="alert">{error}</p> : null}
      <ul>
        {rows.map((row) => (
          <li key={row.id}>
            {row.name} — {row.durationMinutes} min {row.isActive ? '' : '(inativo)'}
          </li>
        ))}
      </ul>
      {can('settings:write') ? (
        <form onSubmit={(event) => void create(event)}>
          <label>
            Nome
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Duração (min)
            <input
              type="number"
              step={5}
              min={5}
              max={480}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
            />
          </label>
          <button type="submit">Criar</button>
        </form>
      ) : null}
    </section>
  )
}
