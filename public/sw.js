// SMASH NEWS service worker — offline app shell + last-sweep data fallback.
const VERSION = 'sr-v4.2.1';
const SHELL = `${VERSION}-shell`;
const DATA = `${VERSION}-data`;
const IMG = 'sr-img';
// Paths are relative to the SW scope so the app also works under a subpath (e.g. GitHub Pages /smash-radar/).
const BASE = new URL('./', self.location).pathname;
const SHELL_FILES = ['', 'index.html', 'styles.css', 'app.js', 'post.js', 'reel.js', 'fonts/anton.woff2', 'fonts/oswald-700.woff2', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'].map((f) => BASE + f);

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (!k.startsWith(VERSION) && k !== IMG) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function networkFirst(req, cacheName, { offlineHeader = false } = {}) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: false });
    if (!hit) throw err;
    if (!offlineHeader) return hit;
    const h = new Headers(hit.headers);
    h.set('x-sr-offline', '1');
    return new Response(await hit.blob(), { status: 200, headers: h });
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const net = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; }).catch(() => hit || Response.error());
  return hit || net;
}

async function trimImages() {
  const c = await caches.open(IMG);
  const keys = await c.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - 250))) await c.delete(k);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    if (url.pathname.endsWith('/api/events')) return; // live stream: never cache
    // Smash's voice clips: let Safari stream them directly (it needs byte-range requests, which a cached copy breaks).
    if (url.pathname.startsWith(`${BASE}audio/`) || req.destination === 'audio' || req.headers.has('range')) return;
    if (url.pathname.startsWith(`${BASE}api/`)) {
      e.respondWith(networkFirst(req, DATA, { offlineHeader: true }));
      return;
    }
    if (req.mode === 'navigate') {
      e.respondWith(fetch(req).catch(async () => (await caches.match(`${BASE}index.html`)) || Response.error()));
      return;
    }
    // app code: newest from the network, cached copy only when offline
    e.respondWith(networkFirst(req, SHELL));
    return;
  }
  // Fonts: cache-first. Story images: cache as they're viewed so recent cards work offline.
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(staleWhileRevalidate(req, SHELL));
    return;
  }
  if (req.destination === 'image') {
    e.respondWith(staleWhileRevalidate(req, IMG).finally(() => trimImages()));
  }
});
