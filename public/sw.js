// Service worker EDICREA AI : fonctionnement hors-ligne et chargement rapide.
const VERSION = 'edicrea-v10'
const CORE = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png']

const FONTS = ['Serif', 'Sans', 'Mono'].flatMap((f) => ['Regular', 'Bold', 'Italic', 'BoldItalic'].map((s) => `/fonts/Liberation${f}-${s}.ttf`))

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION)
    await c.addAll(CORE)
    // pré-charge les fichiers de l'application référencés par index.html (noms versionnés)
    try {
      const html = await (await fetch('/index.html', { cache: 'no-store' })).text()
      const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1])
      await c.addAll([...new Set(assets)])
    } catch { /* hors-ligne pendant l'installation */ }
    await Promise.all(FONTS.map((f) => c.add(f).catch(() => null)))
    await self.skipWaiting()
  })())
})
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // Les appels à l'API IA ne sont jamais mis en cache
  if (url.hostname.endsWith('anthropic.com')) return
  // Pages : réseau d'abord, cache en secours (hors-ligne)
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put('/index.html', copy)); return r }).catch(() => caches.match('/index.html', { ignoreVary: true })))
    return
  }
  // Fichiers versionnés, polices et icônes : cache d'abord
  const cacheable = url.origin === location.origin || url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')
  if (!cacheable) return
  e.respondWith(caches.match(req, { ignoreVary: true, ignoreSearch: url.pathname.startsWith('/assets/') }).then((hit) => {
    const net = fetch(req).then((r) => { if (r && (r.ok || r.type === 'opaque')) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)) } return r }).catch(() => hit)
    return hit || net
  }))
})
