import { Suspense } from 'react'
import LoginPage from './login-form'

export default function LoginRoute() {
  return (
    <Suspense fallback={<main className="auth-page"><p>Carregando…</p></main>}>
      <LoginPage />
    </Suspense>
  )
}
