// THE TRUTH service worker. Always tries the network first (so new files and app updates show up at once) and
// falls back to the last copy when offline. Pictures and fonts never change, so they are served from the cache.
const V = 'truth-v1';
const FRESH = `${V}-fresh`;          // pages, scripts, data: network first
const KEEP = 'truth-keep';           // fonts, icons, thumbnails, pictures: cache first

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== FRESH && k !== KEEP) await caches.delete(k);          // also clears the caches of the news app that lived here before
  await self.clients.claim();
})()));

const isKeep = (url) => /\/(fonts|icons)\/|\/data\/(thumb|img)\//.test(url.pathname);

async function cacheFirst(req) {
  const cache = await caches.open(KEEP); const hit = await cache.match(req); if (hit) return hit;
  const res = await fetch(req); if (res.ok) cache.put(req, res.clone()); return res;
}
async function networkFirst(req) {
  const cache = await caches.open(FRESH); const key = req.url.replace(/[?&]t=\d+/, '');
  try {
    const res = await fetch(req, { cache: 'no-cache' });
    if (res.ok) cache.put(key, res.clone()); return res;
  } catch (err) {
    const hit = (await cache.match(key)) || (req.mode === 'navigate' ? await cache.match(new URL('./', req.url).href) : null);
    if (hit) return hit; throw err;
  }
}
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return; const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL('./', self.location).pathname)) return;
  e.respondWith(isKeep(url) ? cacheFirst(req) : networkFirst(req));
});
// The page tells us which files it loaded on its first visit, so the app also opens offline next time.
self.addEventListener('message', (e) => {
  const list = e.data?.warm; if (!Array.isArray(list)) return;
  e.waitUntil((async () => { const fresh = await caches.open(FRESH), keep = await caches.open(KEEP);
    for (const u of list.slice(0, 120)) { try { const url = new URL(u); if (url.origin !== self.location.origin) continue; const c = isKeep(url) ? keep : fresh; if (!(await c.match(u))) { const r = await fetch(u); if (r.ok) await c.put(u, r); } } catch (err) { /* skip */ } } })());
});
