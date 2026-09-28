// RiftKeeper offline support.
//
// Strategy is deliberately network-first for the page itself: when you have a
// connection you always get the freshly deployed build, and the cached copy is
// only used when the network fails. That avoids the stale-build problem that
// cache-first service workers cause.
//
// Fonts and other assets are cache-first, since they rarely change.
// The card API is never cached here - the app already stores that in
// localStorage with its own weekly refresh.

const CACHE = 'riftkeeper-v1';
const SHELL = ['./', './index.html'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .catch(() => {})            // a failed precache must not block install
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }

  // card data is handled by the app's own localStorage cache
  if (url.hostname === 'api.riftcodex.com') return;

  // the page: network first, cache as the offline fallback
  if (req.mode === 'navigate' || req.destination === 'document') {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html').then(hit => hit || caches.match('./')))
    );
    return;
  }

  // everything else: cache first, then fill from network
  e.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        const cacheable = res.ok &&
          (url.origin === self.location.origin ||
           url.hostname.endsWith('fonts.googleapis.com') ||
           url.hostname.endsWith('fonts.gstatic.com'));
        if (cacheable) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => hit);
    })
  );
});
