// Carehia Client Portal Service Worker v6
const CACHE_NAME = 'carehia-client-v6';

// Always network-first for HTML + JS bundles
const NETWORK_FIRST = ['/index.html', '/', '/dist/'];

self.addEventListener('install', event => {
  console.log('[SW] Installing v6');
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(['/styles.css', '/manifest.json']);
    })
  );
});

self.addEventListener('activate', event => {
  console.log('[SW] Activating v6');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const isNetworkFirst = NETWORK_FIRST.some(p => url.pathname === p || url.pathname.startsWith(p));
  const isAPI = url.hostname.includes('workers.dev') || url.hostname.includes('stripe.com');

  if (isAPI || event.request.method !== 'GET') return;

  if (isNetworkFirst) {
    event.respondWith(
      fetch(event.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return res;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return res;
      });
    })
  );
});
