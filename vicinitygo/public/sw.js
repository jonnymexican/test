// vicinityGo service worker: complete app-shell precache (assets injected at
// build time), cache-first for assets, network-first for the shell.
const CACHE = 'vicinitygo-v5';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Never touch the dev/HMR paths or Vite's dependency optimizer.
  if (url.pathname.includes('/@vite') || url.pathname.includes('/@react')) return;

  // The runtime put must be waited on, or the worker can be terminated
  // mid-write and the entry silently lost.
  const put = (res) => {
    event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, res.clone())));
    return res;
  };

  // The HTML shell: network first (so deploys arrive), cache as fallback.
  // Match by string URL — the Cache API rejects navigate-mode Requests.
  if (event.request.mode === 'navigate' || url.pathname.endsWith('/index.html')) {
    event.respondWith(
      fetch(event.request)
        .then(put)
        .catch(() => caches.match('./index.html', { ignoreSearch: true }))
    );
    return;
  }

  // Hashed assets and static files: cache first. Opaque responses (no-cors
  // loads) report ok=false; cache them too.
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(event.request).then((res) => {
        if (res.ok || res.type === 'opaque') put(res);
        return res;
      });
    })
  );
});
