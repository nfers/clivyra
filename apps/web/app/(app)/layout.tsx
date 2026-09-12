import { redirect } from 'next/navigation'
import { SessionProvider } from '../../lib/session/SessionProvider'
import { getSession } from '../../lib/session/server'
import { AppHeader } from './app-header'

export default async function AppShellLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession()
  if (!session) {
    redirect('/login?next=/app')
  }

  return (
    <SessionProvider initial={session}>
      <div className="app-shell">
        <AppHeader session={session} />
        <main className="app-main">{children}</main>
      </div>
    </SessionProvider>
  )
}
