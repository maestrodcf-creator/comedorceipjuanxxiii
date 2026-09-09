// ============================================
// Service Worker - Comedor CEIP Juan XXIII
// Cachea el "shell" estático de la app para que
// cargue rápido y funcione aunque la conexión sea
// inestable. Los datos siempre van en vivo a
// Supabase (nunca se cachean asistencia ni alumnos).
// ============================================

const CACHE_NAME = 'comedor-juanxxiii-v1';
const ARCHIVOS_SHELL = [
  './index.html',
  './config.js',
  './app.js',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ARCHIVOS_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(
        nombres.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Nunca cachear peticiones a Supabase: los datos siempre deben ir en vivo.
  if (url.hostname.includes('supabase.co')) {
    return;
  }

  // Solo cacheamos peticiones GET del propio origen (el shell de la app).
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((respuestaCacheada) => {
      return respuestaCacheada || fetch(event.request).then((respuestaRed) => {
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, respuestaRed.clone());
          return respuestaRed;
        });
      }).catch(() => respuestaCacheada);
    })
  );
});
