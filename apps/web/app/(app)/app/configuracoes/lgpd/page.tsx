'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import type { DataSubjectRequestType, DataSubjectRequestView } from '@clivyra/types'
import { usePermissions, useSession } from '../../../../../lib/session/SessionProvider'

export default function LgpdPage() {
  const { can } = usePermissions()
  const session = useSession()
  const [items, setItems] = useState<DataSubjectRequestView[]>([])
  const [error, setError] = useState<string | null>(null)
  const [type, setType] = useState<DataSubjectRequestType>('EXPORT')
  const [confirmExecute, setConfirmExecute] = useState<string | null>(null)
  const [exportPreview, setExportPreview] = useState<string | null>(null)

  async function load() {
    const response = await fetch('/api/lgpd/requests')
    if (response.status === 403) {
      setError('Acesso negado.')
      return
    }
    if (!response.ok) {
      setError('Não foi possível carregar as requisições.')
      return
    }
    setItems((await response.json()) as DataSubjectRequestView[])
  }

  useEffect(() => {
    void load()
  }, [])

  async function openRequest(event: FormEvent) {
    event.preventDefault()
    if (!session) return
    const response = await fetch('/api/lgpd/requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        subjectType: 'USER',
        subjectId: session.user.id,
        type,
        channel: 'IN_PERSON',
      }),
    })
    if (!response.ok) {
      setError('Falha ao abrir requisição.')
      return
    }
    await load()
  }

  async function execute(id: string) {
    if (confirmExecute !== id) {
      setConfirmExecute(id)
      return
    }
    setConfirmExecute(null)
    const response = await fetch(`/api/lgpd/requests/${id}/execute`, { method: 'POST' })
    if (!response.ok) {
      setError('Falha ao executar.')
      return
    }
    const payload = (await response.json()) as {
      exportPayload?: { sections: unknown[] }
      erasureSummary?: unknown
    }
    if (payload.exportPayload) {
      setExportPreview(JSON.stringify(payload.exportPayload, null, 2))
    }
    await load()
  }

  async function complete(id: string) {
    await fetch(`/api/lgpd/requests/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'COMPLETED' }),
    })
    await load()
  }

  if (!can('lgpd:manage')) {
    return (
      <section className="settings-page">
        <h2>Acesso negado</h2>
        <p>Somente OWNER/ADMIN gerenciam requisições LGPD.</p>
        <p>
          <Link href="/app">Voltar</Link>
        </p>
      </section>
    )
  }

  return (
    <section className="settings-page" aria-labelledby="lgpd-title">
      <h2 id="lgpd-title">Requisições LGPD</h2>
      <p className="auth-lead">Fila do titular com SLA de 15 dias. Sem purge automático no P0 (D7).</p>

      <form className="settings-form" onSubmit={(event) => void openRequest(event)}>
        <label>
          Tipo
          <select
            value={type}
            onChange={(event) => setType(event.target.value as DataSubjectRequestType)}
          >
            <option value="EXPORT">Exportação</option>
            <option value="ACCESS">Acesso</option>
            <option value="ERASURE">Exclusão/anonimização</option>
            <option value="RECTIFICATION">Retificação</option>
            <option value="CONSENT_REVOCATION">Revogação de consentimento</option>
          </select>
        </label>
        <button type="submit">Abrir para mim (usuário atual)</button>
      </form>

      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="user-list">
        {items.map((item) => (
          <li key={item.id} className={item.overdue ? 'lgpd-overdue' : undefined}>
            <strong>
              {item.type} · {item.status}
            </strong>
            <span>
              Prazo {new Date(item.dueAt).toLocaleDateString('pt-BR')} (
              {item.overdue ? 'vencida' : `${item.daysRemaining}d restantes`})
            </span>
            <div className="row-actions">
              {['RECEIVED', 'IN_PROGRESS'].includes(item.status) &&
              (item.type === 'EXPORT' || item.type === 'ACCESS' || item.type === 'ERASURE') ? (
                <button type="button" onClick={() => void execute(item.id)}>
                  {confirmExecute === item.id ? 'Confirmar execução' : 'Executar'}
                </button>
              ) : null}
              {item.status === 'IN_PROGRESS' ? (
                <button type="button" onClick={() => void complete(item.id)}>
                  Concluir
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {exportPreview ? (
        <pre className="consent-content" aria-label="Prévia da exportação">
          {exportPreview}
        </pre>
      ) : null}
    </section>
  )
}
