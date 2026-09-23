'use strict';
// ORBIT offline support. Bump VERSION when this file's logic changes.
// Game updates don't need a bump: every launch checks index.html against
// the cached copy and tells the page when a newer one is ready.
const VERSION = 'orbit-v1';
const scope = self.registration.scope;
const at = path => new URL(path, scope).href;
const INDEX = at('index.html');
const ASSETS = ['index.html', 'manifest.json', 'icon-192.png', 'icon-512.png',
  'icon-maskable-512.png', 'apple-touch-icon.png'].map(at);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      // Only touch ORBIT caches; other projects share this github.io origin.
      .then(keys => Promise.all(keys.filter(k => k.startsWith('orbit-') && k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || !request.url.startsWith(scope)) return;
  const url = new URL(request.url);
  const clean = url.origin + url.pathname;
  const isIndex = clean === INDEX || (request.mode === 'navigate' && clean === scope);
  const key = isIndex ? INDEX : clean;
  if (!isIndex && !ASSETS.includes(key)) return; // anything else goes to the network as usual
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(key);
    if (hit) return hit;
    const response = await fetch(request);
    if (response.ok) cache.put(key, response.clone());
    return response;
  })());
});

// The page asks on launch and when it returns to the foreground.
self.addEventListener('message', event => {
  if (!event.data || event.data.type !== 'check-update') return;
  event.waitUntil(checkForUpdate().then(changed => {
    if (changed && event.source) event.source.postMessage({ type: 'update-ready' });
  }).catch(() => {}));
});

async function checkForUpdate() {
  const cache = await caches.open(VERSION);
  const response = await fetch(INDEX, { cache: 'no-cache' });
  if (!response.ok) return false;
  const fresh = await response.clone().text();
  const cached = await cache.match(INDEX);
  const old = cached ? await cached.text() : null;
  // Keep the icons and manifest fresh too, quietly.
  for (const url of ASSETS) if (url !== INDEX) {
    fetch(url, { cache: 'no-cache' }).then(r => r.ok && cache.put(url, r)).catch(() => {});
  }
  if (old === fresh) return false;
  await cache.put(INDEX, response);
  return old !== null;
}
