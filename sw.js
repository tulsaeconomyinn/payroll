// Economy Suites Payroll service worker — minimal and safe.
// Strategy:
//   - Navigation requests and index.html: network-first (always fresh shell).
//   - Versioned static assets (URLs containing "?v="): cache-first.
//   - Everything else: network, no caching.
// On activate, delete any caches that don't match the current version.
const CACHE_VERSION = 'esp-v4';
const STATIC_CACHE = 'esp-static-' + CACHE_VERSION;

self.addEventListener('install', event => {
  // Activate immediately; don't wait for old worker.
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

function isVersionedAsset(url) {
  return url.searchParams.has('v') || url.href.includes('?v=');
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Only handle same-origin requests; leave CDN/API calls alone.
  if (url.origin !== self.location.origin) return;

  const isNavigation =
    req.mode === 'navigate' ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('/index.html');

  if (isNavigation || url.pathname.endsWith('/index.html')) {
    // Network-first: always try the live page, fall back to cache.
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then(cache => cache.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  if (isVersionedAsset(url)) {
    // Cache-first: versioned URLs are immutable (?v= bumps on deploy).
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then(cache => cache.put(req, copy)).catch(() => {});
          }
          return res;
        });
      })
    );
    return;
  }
  // Anything else: network only, no caching.
});
