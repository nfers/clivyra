'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { SPECIALTIES, type ProfessionalView } from '@clivyra/types'
import { usePermissions } from '../../../lib/session/SessionProvider'

export default function ProfilePage() {
  const { can } = usePermissions()
  const [profile, setProfile] = useState<ProfessionalView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [bio, setBio] = useState('')
  const [specialties, setSpecialties] = useState<string[]>([])

  async function load() {
    const response = await fetch('/api/professionals/me')
    if (response.status === 404) {
      setError('Nenhum perfil profissional vinculado à sua conta.')
      return
    }
    if (!response.ok) {
      setError('Não foi possível carregar o perfil.')
      return
    }
    const body = (await response.json()) as ProfessionalView
    setProfile(body)
    setBio(body.bio ?? '')
    setSpecialties([...body.specialties])
  }

  useEffect(() => {
    void load()
  }, [])

  if (!can('professionals:self')) {
    return (
      <section className="settings-page">
        <h2>Acesso negado</h2>
        <Link href="/app">Voltar</Link>
      </section>
    )
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    const response = await fetch('/api/professionals/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bio, specialties }),
    })
    if (!response.ok) {
      setError('Falha ao salvar perfil.')
      return
    }
    await load()
  }

  return (
    <section className="settings-page" aria-labelledby="profile-title">
      <h2 id="profile-title">Meu perfil</h2>
      <p>
        <Link href="/app">Voltar</Link>
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {profile ? (
        <form onSubmit={(event) => void save(event)}>
          <p>
            <strong>{profile.displayName}</strong> — {profile.status}
          </p>
          <label>
            Bio
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} rows={4} />
          </label>
          <fieldset>
            <legend>Especialidades</legend>
            {SPECIALTIES.map((item) => (
              <label key={item}>
                <input
                  type="checkbox"
                  checked={specialties.includes(item)}
                  onChange={(e) => {
                    setSpecialties((prev) =>
                      e.target.checked ? [...prev, item] : prev.filter((value) => value !== item),
                    )
                  }}
                />{' '}
                {item}
              </label>
            ))}
          </fieldset>
          <button type="submit">Salvar</button>
        </form>
      ) : null}
    </section>
  )
}
