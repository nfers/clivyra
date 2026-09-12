'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import type { ProfessionalListItemView } from '@clivyra/types'
import { usePermissions } from '../../../../../lib/session/SessionProvider'

export default function ProfessionalsSettingsPage() {
  const { can } = usePermissions()
  const [rows, setRows] = useState<ProfessionalListItemView[]>([])
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const response = await fetch('/api/professionals')
    if (!response.ok) {
      setError('Não foi possível carregar profissionais.')
      return
    }
    setRows((await response.json()) as ProfessionalListItemView[])
  }

  useEffect(() => {
    void load()
  }, [])

  if (!can('professionals:read')) {
    return (
      <section className="settings-page">
        <h2>Acesso negado</h2>
        <Link href="/app">Voltar</Link>
      </section>
    )
  }

  async function create(event: FormEvent) {
    event.preventDefault()
    if (!can('professionals:write')) return
    const response = await fetch('/api/professionals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName, councilNotApplicable: true, status: 'ACTIVE' }),
    })
    if (!response.ok) {
      setError('Falha ao criar profissional.')
      return
    }
    setDisplayName('')
    await load()
  }

  return (
    <section className="settings-page" aria-labelledby="pros-title">
      <h2 id="pros-title">Profissionais</h2>
      <p>
        <Link href="/app">Voltar</Link>
      </p>
      {error ? <p role="alert">{error}</p> : null}
      <ul>
        {rows.map((row) => (
          <li key={row.id}>
            <strong>{row.displayName}</strong> — {row.status}
            {row.specialties.length ? ` · ${row.specialties.join(', ')}` : ''}
            {row.councilNumber ? ` · ${row.councilType} ${row.councilNumber}` : ''}
            {row.phone ? ` · ${row.phone}` : ''}
          </li>
        ))}
      </ul>
      {can('professionals:write') ? (
        <form onSubmit={(event) => void create(event)}>
          <label>
            Novo profissional
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required minLength={2} />
          </label>
          <button type="submit">Criar</button>
        </form>
      ) : null}
    </section>
  )
}
