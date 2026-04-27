const CACHE_NAME = 'gotocare-client-v4';
const STATIC_ASSETS = [
  '/',
  '/index.html'
];

// Install — cache shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate — remove old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network first for HTML (always fresh), cache fallback for static
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Skip non-GET and API calls
  if (e.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.hostname.includes('stripe.com')) return;

  // Always network-first for HTML pages — never serve stale index.html
  if (url.pathname === '/' || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request).then(cached => cached || caches.match('/index.html')))
    );
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// Background sync placeholder for offline bookings
self.addEventListener('sync', e => {
  if (e.tag === 'sync-booking') {
    console.log('[SW] Background sync: booking');
  }
});
