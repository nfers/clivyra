'use client'

import { FormEvent, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

type TenantOption = { tenantId: string; slug: string; name: string }

export default function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = searchParams.get('next') || '/app'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [tenantSlug, setTenantSlug] = useState('')
  const [tenants, setTenants] = useState<TenantOption[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const needsTenant = tenants.length > 1
  const errorId = useMemo(() => (error ? 'login-error' : undefined), [error])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)

    const response = await fetch('/api/session/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        ...(tenantSlug ? { tenantSlug } : {}),
      }),
    })

    const payload = await response.json().catch(() => null)
    setPending(false)

    if (response.status === 409 && payload?.code === 'TENANT_SELECTION_REQUIRED') {
      setTenants(payload.tenants ?? [])
      setError('Selecione o studio para continuar.')
      return
    }

    if (!response.ok) {
      setError(
        response.status === 423
          ? 'Conta temporariamente bloqueada. Tente novamente em alguns minutos.'
          : 'Não foi possível entrar. Verifique e-mail e senha.',
      )
      return
    }

    router.replace(nextPath)
    router.refresh()
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="login-title">
        <p className="eyebrow">Clivyra</p>
        <h1 id="login-title">Entrar</h1>
        <p className="auth-lead">Acesse o painel do seu studio com e-mail e senha.</p>

        <form className="auth-form" onSubmit={onSubmit} noValidate>
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={errorId}
          />

          <label htmlFor="password">Senha</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={errorId}
          />

          {needsTenant ? (
            <>
              <label htmlFor="tenantSlug">Studio</label>
              <select
                id="tenantSlug"
                name="tenantSlug"
                required
                value={tenantSlug}
                onChange={(event) => setTenantSlug(event.target.value)}
              >
                <option value="">Selecione</option>
                {tenants.map((tenant) => (
                  <option key={tenant.tenantId} value={tenant.slug}>
                    {tenant.name}
                  </option>
                ))}
              </select>
            </>
          ) : null}

          {error ? (
            <p id="login-error" className="auth-error" role="alert" aria-live="assertive">
              {error}
            </p>
          ) : null}

          <button type="submit" disabled={pending}>
            {pending ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="auth-footer">
          <Link href="/recuperar-senha">Esqueci minha senha</Link>
        </p>
      </section>
    </main>
  )
}
