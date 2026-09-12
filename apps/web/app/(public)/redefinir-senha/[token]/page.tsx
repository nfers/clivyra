'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'

export default function ResetPasswordPage() {
  const params = useParams<{ token: string }>()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('As senhas não coincidem.')
      return
    }
    setPending(true)
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3001'}/auth/password-reset/confirm`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: params.token, password }),
      },
    )
    setPending(false)
    if (!response.ok) {
      setError('Não foi possível redefinir a senha. Solicite um novo link.')
      return
    }
    router.replace('/login')
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="reset-title">
        <p className="eyebrow">Clivyra</p>
        <h1 id="reset-title">Redefinir senha</h1>
        <p className="auth-lead">Escolha uma senha forte com pelo menos 12 caracteres.</p>

        <form className="auth-form" onSubmit={onSubmit}>
          <label htmlFor="password">Nova senha</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={12}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'reset-error' : undefined}
          />

          <label htmlFor="confirm">Confirmar senha</label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            required
            minLength={12}
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />

          {error ? (
            <p id="reset-error" className="auth-error" role="alert" aria-live="assertive">
              {error}
            </p>
          ) : null}

          <button type="submit" disabled={pending}>
            {pending ? 'Salvando…' : 'Salvar nova senha'}
          </button>
        </form>

        <p className="auth-footer">
          <Link href="/login">Voltar ao login</Link>
        </p>
      </section>
    </main>
  )
}
