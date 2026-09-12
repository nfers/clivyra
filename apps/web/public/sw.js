const CACHE_NAME = 'clivyra-shell-v2'
const APP_SHELL = ['/', '/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/app') || url.pathname.startsWith('/login') || url.pathname.startsWith('/storage/') || url.pathname.startsWith('/onboarding')) {
    return
  }

  event.respondWith(caches.match(event.request).then((cached) => cached ?? fetch(event.request)))
})
