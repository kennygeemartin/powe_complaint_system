// PowerResolve PWA service worker: offline shell only, NEVER store API or user records.
const CACHE = 'powerresolve-static-v1';
const ALLOWED = new Set([
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/powerresolve-192.png',
  '/icons/powerresolve-512.png'
]);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([...ALLOWED])));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || req.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return; // Never cache authentication, complaints or private information.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(async () =>
      (await caches.match('/offline.html')) || Response.error()
    ));
    return;
  }
  if (ALLOWED.has(url.pathname)) {
    event.respondWith(caches.match(req).then(cached =>
      cached || fetch(req)
    ));
  }
});
