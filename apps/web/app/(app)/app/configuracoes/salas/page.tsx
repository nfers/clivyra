'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import type { RoomView } from '@clivyra/types'
import { usePermissions } from '../../../../../lib/session/SessionProvider'

export default function RoomsSettingsPage() {
  const { can } = usePermissions()
  const [rows, setRows] = useState<RoomView[]>([])
  const [name, setName] = useState('')
  const [capacity, setCapacity] = useState(1)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const response = await fetch('/api/rooms')
    if (!response.ok) {
      setError('Não foi possível carregar salas.')
      return
    }
    setRows((await response.json()) as RoomView[])
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
    const response = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, capacity }),
    })
    if (!response.ok) {
      setError('Falha ao criar sala.')
      return
    }
    setName('')
    await load()
  }

  return (
    <section className="settings-page" aria-labelledby="rooms-title">
      <h2 id="rooms-title">Salas</h2>
      <p>
        <Link href="/app">Voltar</Link>
      </p>
      {error ? <p role="alert">{error}</p> : null}
      <ul>
        {rows.map((row) => (
          <li key={row.id}>
            {row.name} — capacidade {row.capacity} {row.isActive ? '' : '(inativa)'}
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
            Capacidade
            <input
              type="number"
              min={1}
              max={50}
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))}
            />
          </label>
          <button type="submit">Criar</button>
        </form>
      ) : null}
    </section>
  )
}
