import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Clivyra',
    short_name: 'Clivyra',
    description: 'Gestão segura para clínicas e studios.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f7faf7',
    theme_color: '#14532d',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  }
}
