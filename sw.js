const CACHE_NAME = 'open-today-alicante-v10';
const APP_SHELL = ['/', '/data/stores.json', '/manifest.webmanifest', '/icon.svg', '/privacy.html'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isDataset = url.pathname.endsWith('/data/stores.json');
  const isNavigation = req.mode === 'navigate';

  if (isDataset) {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        return response;
      }).catch(() => caches.match(req))
    );
    return;
  }

  if (isNavigation) {
    event.respondWith(
      fetch(req).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put('/', copy));
        return response;
      }).catch(() => caches.match('/'))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
      return response;
    }))
  );
});
