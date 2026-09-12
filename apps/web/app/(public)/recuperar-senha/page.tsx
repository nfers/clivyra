'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'

export default function RecoverPasswordPage() {
  const [email, setEmail] = useState('')
  const [done, setDone] = useState(false)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3001'}/auth/password-reset/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    setPending(false)
    setDone(true)
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="recover-title">
        <p className="eyebrow">Clivyra</p>
        <h1 id="recover-title">Recuperar senha</h1>
        <p className="auth-lead">
          Informe seu e-mail. Se existir uma conta ativa, enviaremos um link para redefinir a senha.
        </p>

        {done ? (
          <p className="auth-success" role="status" aria-live="polite">
            Se o e-mail estiver cadastrado, você receberá as instruções em breve.
          </p>
        ) : (
          <form className="auth-form" onSubmit={onSubmit}>
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <button type="submit" disabled={pending}>
              {pending ? 'Enviando…' : 'Enviar link'}
            </button>
          </form>
        )}

        <p className="auth-footer">
          <Link href="/login">Voltar ao login</Link>
        </p>
      </section>
    </main>
  )
}
