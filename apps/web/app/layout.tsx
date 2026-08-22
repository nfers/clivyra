import type { Metadata, Viewport } from 'next'
import { ServiceWorkerRegistration } from './service-worker-registration'
import './styles.css'

export const metadata: Metadata = {
  title: 'Clivyra',
  description: 'Gestão segura para clínicas e studios.',
}

export const viewport: Viewport = {
  themeColor: '#14532d',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  )
}
