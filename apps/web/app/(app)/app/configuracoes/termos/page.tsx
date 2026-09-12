'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import type { ConsentTermType, ConsentTermView } from '@clivyra/types'
import { usePermissions } from '../../../../../lib/session/SessionProvider'
import { ConsentCapture } from '../../../../../components/consent/ConsentCapture'
import { ConsentStatusBadge } from '../../../../../components/consent/ConsentStatusBadge'
import type { ConsentStatusKind, ConsentStatusMap } from '@clivyra/types'
import { useSession } from '../../../../../lib/session/SessionProvider'

const TYPE_LABELS: Record<ConsentTermType, string> = {
  PRIVACY_POLICY: 'Política de privacidade',
  DATA_PROCESSING: 'Tratamento de dados',
  TREATMENT: 'Atendimento',
  IMAGE_USE: 'Uso de imagem',
  COMMUNICATIONS: 'Comunicações',
}

export default function TermosPage() {
  const { can } = usePermissions()
  const session = useSession()
  const [terms, setTerms] = useState<ConsentTermView[]>([])
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [type, setType] = useState<ConsentTermType>('DATA_PROCESSING')
  const [requiresReconsent, setRequiresReconsent] = useState(false)
  const [statusMap, setStatusMap] = useState<ConsentStatusMap | null>(null)
  const [captureTermId, setCaptureTermId] = useState<string | null>(null)

  async function load() {
    const response = await fetch('/api/consent-terms')
    if (!response.ok) {
      setError('Não foi possível carregar os termos.')
      return
    }
    setTerms((await response.json()) as ConsentTermView[])
    if (session?.user.id) {
      const statusRes = await fetch(
        `/api/consents/status?subjectType=USER&subjectId=${encodeURIComponent(session.user.id)}`,
      )
      if (statusRes.ok) {
        setStatusMap((await statusRes.json()) as ConsentStatusMap)
      }
    }
  }

  useEffect(() => {
    void load()
  }, [session?.user.id])

  async function createDraft(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const response = await fetch('/api/consent-terms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type,
        title,
        content,
        purposes: ['operacao'],
      }),
    })
    if (!response.ok) {
      setError('Falha ao criar rascunho.')
      return
    }
    setTitle('')
    setContent('')
    await load()
  }

  async function publish(id: string) {
    const response = await fetch(`/api/consent-terms/${id}/publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requiresReconsent }),
    })
    if (!response.ok) {
      setError('Falha ao publicar.')
      return
    }
    await load()
  }

  if (!can('consent:read')) {
    return (
      <section className="settings-page">
        <h2>Acesso negado</h2>
        <p>
          <Link href="/app">Voltar</Link>
        </p>
      </section>
    )
  }

  const published = terms.filter((t) => t.status === 'PUBLISHED')

  return (
    <section className="settings-page" aria-labelledby="termos-title">
      <h2 id="termos-title">Termos de consentimento</h2>
      <p className="auth-lead">
        Versões por tipo. Textos-modelo exigem revisão jurídica antes da produção comercial.
      </p>

      {statusMap ? (
        <ul className="consent-status-row">
          {(Object.entries(statusMap) as [ConsentTermType, { status: ConsentStatusKind }][]).map(
            ([key, value]) =>
              value.status !== 'MISSING' || published.some((t) => t.type === key) ? (
                <li key={key}>
                  <span>{TYPE_LABELS[key]}</span>
                  <ConsentStatusBadge status={value.status} />
                </li>
              ) : null,
          )}
        </ul>
      ) : null}

      {can('settings:write') ? (
        <form className="settings-form" onSubmit={(event) => void createDraft(event)}>
          <h3>Novo rascunho</h3>
          <label>
            Tipo
            <select value={type} onChange={(event) => setType(event.target.value as ConsentTermType)}>
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Título
            <input value={title} onChange={(event) => setTitle(event.target.value)} required />
          </label>
          <label>
            Conteúdo (markdown)
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={8}
              required
            />
          </label>
          <button type="submit">Salvar rascunho</button>
        </form>
      ) : null}

      {can('settings:write') ? (
        <label className="inline-check">
          <input
            type="checkbox"
            checked={requiresReconsent}
            onChange={(event) => setRequiresReconsent(event.target.checked)}
          />
          Exigir novo aceite ao publicar
        </label>
      ) : null}

      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="user-list">
        {terms.map((term) => (
          <li key={term.id}>
            <strong>
              {TYPE_LABELS[term.type]} · v{term.version || 'rascunho'} · {term.status}
            </strong>
            <span>{term.title}</span>
            <div className="row-actions">
              {term.status === 'DRAFT' && can('settings:write') ? (
                <button type="button" onClick={() => void publish(term.id)}>
                  Publicar
                </button>
              ) : null}
              {term.status === 'PUBLISHED' && can('consent:write') && session ? (
                <button type="button" onClick={() => setCaptureTermId(term.id)}>
                  Registrar aceite
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {captureTermId && session ? (
        <ConsentCapture
          termId={captureTermId}
          subjectType="USER"
          subjectId={session.user.id}
          onGranted={() => {
            setCaptureTermId(null)
            void load()
          }}
        />
      ) : null}
    </section>
  )
}
