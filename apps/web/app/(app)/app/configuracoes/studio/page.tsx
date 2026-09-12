'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import type { TenantSettingsView } from '@clivyra/types'
import { usePermissions } from '../../../../../lib/session/SessionProvider'

export default function StudioSettingsPage() {
  const { can } = usePermissions()
  const [settings, setSettings] = useState<TenantSettingsView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function load() {
    const response = await fetch('/api/tenant/settings')
    if (!response.ok) {
      setError('Não foi possível carregar as configurações.')
      return
    }
    setSettings((await response.json()) as TenantSettingsView)
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

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!settings || !can('settings:write')) return
    setPending(true)
    setError(null)
    const form = new FormData(event.currentTarget)
    const body: Record<string, string> = {
      displayName: String(form.get('displayName') ?? ''),
      phone: String(form.get('phone') ?? ''),
      email: String(form.get('email') ?? ''),
      timezone: String(form.get('timezone') ?? 'America/Sao_Paulo'),
    }
    if (can('tenant:manage')) {
      body.legalName = String(form.get('legalName') ?? '')
      body.documentType = String(form.get('documentType') ?? 'CNPJ')
      body.documentNumber = String(form.get('documentNumber') ?? '')
    }
    const response = await fetch('/api/tenant/settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    setPending(false)
    if (!response.ok) {
      setError('Falha ao salvar.')
      return
    }
    await load()
  }

  return (
    <section className="settings-page" aria-labelledby="studio-title">
      <h2 id="studio-title">Studio</h2>
      <p>
        <Link href="/app">Voltar</Link>
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {settings ? (
        <form onSubmit={(event) => void save(event)}>
          <label>
            Nome fantasia
            <input name="displayName" defaultValue={settings.displayName} required disabled={!can('settings:write')} />
          </label>
          <label>
            Telefone
            <input name="phone" defaultValue={settings.phone ?? ''} disabled={!can('settings:write')} />
          </label>
          <label>
            E-mail
            <input name="email" defaultValue={settings.email ?? ''} disabled={!can('settings:write')} />
          </label>
          <label>
            Fuso
            <input name="timezone" defaultValue={settings.timezone} disabled={!can('settings:write')} />
          </label>
          {can('tenant:manage') ? (
            <>
              <label>
                Razão social
                <input name="legalName" defaultValue={settings.legalName ?? ''} />
              </label>
              <label>
                Tipo de documento
                <select name="documentType" defaultValue={settings.documentType ?? 'CNPJ'}>
                  <option value="CNPJ">CNPJ</option>
                  <option value="CPF">CPF</option>
                </select>
              </label>
              <label>
                Documento
                <input name="documentNumber" defaultValue={settings.documentNumber ?? ''} />
              </label>
            </>
          ) : null}
          {can('settings:write') ? (
            <button type="submit" disabled={pending}>
              Salvar
            </button>
          ) : null}
        </form>
      ) : (
        <p>Carregando…</p>
      )}
    </section>
  )
}
