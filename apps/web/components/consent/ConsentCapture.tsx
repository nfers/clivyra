'use client'

import { FormEvent, useEffect, useState } from 'react'
import type { ConsentTermContentView } from '@clivyra/types'

type Props = {
  termId: string
  subjectType: 'USER' | 'PATIENT' | 'LEAD'
  subjectId: string
  onGranted?: () => void
}

/**
 * P0: IN_PERSON capture by a professional (WEB_FORM public route is out of scope).
 */
export function ConsentCapture({ termId, subjectType, subjectId, onGranted }: Props) {
  const [term, setTerm] = useState<ConsentTermContentView | null>(null)
  const [signerName, setSignerName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    void (async () => {
      const response = await fetch(`/api/consent-terms/${termId}/content`)
      if (!response.ok) {
        setError('Não foi possível carregar o termo.')
        return
      }
      setTerm((await response.json()) as ConsentTermContentView)
    })()
  }, [termId])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    const response = await fetch('/api/consents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        subjectType,
        subjectId,
        termId,
        source: 'IN_PERSON',
        evidence: { signerName },
      }),
    })
    setPending(false)
    if (!response.ok) {
      setError('Não foi possível registrar o aceite.')
      return
    }
    setSignerName('')
    onGranted?.()
  }

  if (!term && !error) {
    return <p className="auth-lead">Carregando termo…</p>
  }

  return (
    <form className="consent-capture" onSubmit={(event) => void submit(event)}>
      {term ? (
        <>
          <h3>{term.title}</h3>
          <p className="auth-lead">
            Versão {term.version} · hash {term.contentHash?.slice(0, 12)}…
          </p>
          <pre className="consent-content">{term.content}</pre>
        </>
      ) : null}
      <label>
        Nome de quem assinou (presencial)
        <input
          value={signerName}
          onChange={(event) => setSignerName(event.target.value)}
          required
          maxLength={120}
          aria-label="Nome de quem assinou"
        />
      </label>
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={pending || !signerName.trim()}>
        Registrar aceite presencial
      </button>
    </form>
  )
}
