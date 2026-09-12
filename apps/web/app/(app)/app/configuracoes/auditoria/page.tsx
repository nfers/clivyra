'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AUDIT_ACTION_LABELS_PT,
  isAuditAction,
  type AuditLogView,
} from '@clivyra/types'
import { usePermissions } from '../../../../../lib/session/SessionProvider'

type ListResponse = {
  items: AuditLogView[]
  nextCursor: string | null
}

function labelFor(action: string): string {
  if (isAuditAction(action)) return AUDIT_ACTION_LABELS_PT[action]
  return action
}

export default function AuditoriaPage() {
  const { can, refreshPermissions } = usePermissions()
  const [items, setItems] = useState<AuditLogView[]>([])
  const [error, setError] = useState<string | null>(null)
  const [action, setAction] = useState('')
  const [selected, setSelected] = useState<AuditLogView | null>(null)
  const [pending, setPending] = useState(false)

  async function load(event?: FormEvent) {
    event?.preventDefault()
    setPending(true)
    setError(null)
    const params = new URLSearchParams()
    if (action.trim()) params.set('action', action.trim())
    const response = await fetch(`/api/audit-logs?${params.toString()}`)
    setPending(false)
    if (response.status === 403) {
      setError('Acesso negado. Você não tem permissão para ver a auditoria.')
      await refreshPermissions()
      return
    }
    if (!response.ok) {
      setError('Não foi possível carregar a trilha de auditoria.')
      return
    }
    const payload = (await response.json()) as ListResponse
    setItems(payload.items)
  }

  useEffect(() => {
    void load()
  }, [])

  if (!can('audit:read')) {
    return (
      <section className="settings-page" aria-labelledby="audit-denied-title">
        <h2 id="audit-denied-title">Acesso negado</h2>
        <p>Você não tem permissão para consultar a auditoria deste studio.</p>
        <p>
          <Link href="/app">Voltar ao painel</Link>
        </p>
      </section>
    )
  }

  return (
    <section className="settings-page" aria-labelledby="audit-title">
      <h2 id="audit-title">Auditoria</h2>
      <p className="auth-lead">Trilha somente leitura das ações sensíveis deste studio.</p>

      <form className="settings-toolbar" onSubmit={(event) => void load(event)}>
        <label>
          Ação
          <input
            value={action}
            onChange={(event) => setAction(event.target.value)}
            placeholder="users.role.changed ou users."
            aria-label="Filtrar por ação"
          />
        </label>
        <button type="submit" disabled={pending}>
          Filtrar
        </button>
      </form>

      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="user-list audit-list">
        {items.map((row) => (
          <li key={row.id}>
            <button type="button" className="audit-row" onClick={() => setSelected(row)}>
              <strong>{labelFor(row.action)}</strong>
              <span>{new Date(row.occurredAt).toLocaleString('pt-BR')}</span>
              <span>
                {row.actor.name ?? (row.actor.userId ? 'usuário removido' : 'sistema')}
                {row.actor.role ? ` · ${row.actor.role}` : ''}
              </span>
              <span>
                {row.entityType}
                {row.entityId ? ` · ${row.entityId.slice(0, 8)}…` : ''} · {row.outcome}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {items.length === 0 && !error ? <p>Nenhum evento no período.</p> : null}

      {selected ? (
        <aside className="audit-drawer" aria-label="Detalhe do evento">
          <header>
            <h3>{labelFor(selected.action)}</h3>
            <button type="button" className="ghost-button" onClick={() => setSelected(null)}>
              Fechar
            </button>
          </header>
          <dl>
            <div>
              <dt>Quando</dt>
              <dd>{new Date(selected.occurredAt).toLocaleString('pt-BR')}</dd>
            </div>
            <div>
              <dt>Ator</dt>
              <dd>
                {selected.actor.name ?? (selected.actor.userId ? 'usuário removido' : 'sistema')}
                {selected.actor.role ? ` (${selected.actor.role})` : ''}
              </dd>
            </div>
            <div>
              <dt>Entidade</dt>
              <dd>
                {selected.entityType}
                {selected.entityId ? ` / ${selected.entityId}` : ''}
              </dd>
            </div>
            <div>
              <dt>Resultado</dt>
              <dd>{selected.outcome}</dd>
            </div>
            {selected.metadata ? (
              <div>
                <dt>Metadados</dt>
                <dd>
                  <pre>{JSON.stringify(selected.metadata, null, 2)}</pre>
                </dd>
              </div>
            ) : null}
            {selected.changes ? (
              <div>
                <dt>Alterações</dt>
                <dd>
                  <pre>{JSON.stringify(selected.changes, null, 2)}</pre>
                </dd>
              </div>
            ) : null}
          </dl>
        </aside>
      ) : null}
    </section>
  )
}
