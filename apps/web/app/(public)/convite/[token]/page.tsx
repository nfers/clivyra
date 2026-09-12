'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

type Preview = {
  tenantName: string
  email: string
  role: string
  expiresAt: string
  existingUser: boolean
}

export default function AcceptInvitePage() {
  const params = useParams<{ token: string }>()
  const router = useRouter()
  const token = params.token
  const [preview, setPreview] = useState<Preview | null>(null)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    void (async () => {
      const response = await fetch(`/api/auth/invitations/${encodeURIComponent(token)}`)
      if (!response.ok) {
        setError(
          response.status === 410
            ? 'Este convite expirou.'
            : 'Convite inválido ou indisponível.',
        )
        return
      }
      setPreview((await response.json()) as Preview)
    })()
  }, [token])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    const response = await fetch('/api/auth/invitations/accept', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token,
        password,
        ...(preview?.existingUser ? {} : { name }),
      }),
    })
    setPending(false)
    if (!response.ok) {
      setError('Não foi possível aceitar o convite. Verifique os dados e tente novamente.')
      return
    }
    router.replace('/app')
    router.refresh()
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="invite-title">
        <p className="eyebrow">Clivyra</p>
        <h1 id="invite-title">Aceitar convite</h1>
        {preview ? (
          <p className="auth-lead">
            Você foi convidado para <strong>{preview.tenantName}</strong> como {preview.role} (
            {preview.email}).
          </p>
        ) : (
          <p className="auth-lead">Carregando convite…</p>
        )}

        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}

        {preview ? (
          <form className="auth-form" onSubmit={(event) => void onSubmit(event)}>
            {!preview.existingUser ? (
              <>
                <label htmlFor="invite-name">Nome</label>
                <input
                  id="invite-name"
                  required
                  minLength={2}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </>
            ) : null}
            <label htmlFor="invite-password">
              {preview.existingUser ? 'Senha da conta' : 'Criar senha'}
            </label>
            <input
              id="invite-password"
              type="password"
              required
              minLength={preview.existingUser ? 1 : 12}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button type="submit" disabled={pending}>
              Entrar no studio
            </button>
          </form>
        ) : null}
      </section>
    </main>
  )
}
