// SMASH RADAR — Node server: static PWA + JSON API + live event stream + background scheduler.
// Zero dependencies. Requires Node 20+.  Run: node server.js
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
loadEnv(path.join(ROOT, '.env'));

const { FileStore } = await import('./src/store.js');
const { handleApi } = await import('./src/api.js');
const { refresh, getSources, tierMinutes, isRefreshing } = await import('./src/collector.js');
const { localDateKey } = await import('./src/util.js');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const DB = path.resolve(ROOT, process.env.DATABASE_PATH || 'data/smash-radar.json');
const PUBLIC = path.join(ROOT, 'public');
const AUTO = process.env.AUTO_REFRESH !== 'off';
const DAILY_HOUR = Number(process.env.DAILY_REFRESH_HOUR ?? 5);
const DAILY_MIN = Number(process.env.DAILY_REFRESH_MINUTE ?? 15);

const store = new FileStore(DB);
await store.load();

// ---------- live events (Server-Sent Events) ----------
const clients = new Set();
function broadcast(evt) {
  const line = `event: ${evt.type}\ndata: ${JSON.stringify(evt)}\n\n`;
  for (const res of clients) res.write(line);
}

function runRefresh({ force = false, trigger = 'schedule' } = {}) {
  return refresh(store, { force, trigger, onEvent: broadcast }).catch((e) => {
    log('refresh failed:', e.stack || e.message);
    broadcast({ type: 'refresh:error', error: e.message });
  });
}

function nextRefreshAt() {
  const state = store.state;
  let next = Infinity;
  for (const s of getSources(state)) {
    if (s.enabled === false) continue;
    const h = state.sources[s.id];
    const backoff = Math.min(4, 1 + (h?.consecutiveFailures || 0));
    const t = h?.lastCheckedAt ? Date.parse(h.lastCheckedAt) + tierMinutes(s.tier) * 60e3 * backoff : Date.now();
    next = Math.min(next, t);
  }
  return Number.isFinite(next) ? new Date(Math.max(next, Date.now())).toISOString() : null;
}

// ---------- scheduler ----------
let lastDailyKey = null;
function tick() {
  if (!AUTO || isRefreshing()) return;
  const now = new Date();
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(now).map((p) => [p.type, p.value]));
  const today = localDateKey(now);
  if (Number(parts.hour) === DAILY_HOUR && Number(parts.minute) >= DAILY_MIN && lastDailyKey !== today) {
    lastDailyKey = today;
    log('daily full refresh');
    return runRefresh({ force: true, trigger: 'daily' });
  }
  const next = nextRefreshAt();
  if (next && Date.parse(next) <= Date.now() + 5000) runRefresh({ trigger: 'schedule' });
}

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain' };

function send(req, res, status, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  const type = headers['content-type'] || 'application/json; charset=utf-8';
  const gz = buf.length > 1024 && /gzip/.test(req.headers['accept-encoding'] || '') && /json|text|javascript|svg|manifest/.test(type);
  res.writeHead(status, { 'content-type': type, ...(gz ? { 'content-encoding': 'gzip', vary: 'accept-encoding' } : {}), 'x-content-type-options': 'nosniff', ...headers });
  res.end(gz ? zlib.gzipSync(buf) : buf);
}

async function readBody(req) {
  let data = '';
  for await (const chunk of req) { data += chunk; if (data.length > 1e6) throw new Error('Body too large'); }
  if (!data) return {};
  try { return JSON.parse(data); } catch { return {}; }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/api/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      res.write(`event: hello\ndata: ${JSON.stringify({ type: 'hello', refreshing: isRefreshing(), lastRefreshAt: store.state.meta.lastRefreshAt || null })}\n\n`);
      clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 25000);
      req.on('close', () => { clearInterval(ping); clients.delete(res); });
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      const body = ['POST', 'PATCH', 'PUT'].includes(req.method) ? await readBody(req) : {};
      const out = await handleApi({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body }, { store, runRefresh, nextRefreshAt, mode: 'node' });
      return send(req, res, out.status, out.body, { 'cache-control': 'no-store' });
    }
    // static
    let file = path.normalize(path.join(PUBLIC, decodeURIComponent(url.pathname)));
    if (!file.startsWith(PUBLIC)) return send(req, res, 403, { error: 'forbidden' });
    let stat = await fs.promises.stat(file).catch(() => null);
    if (stat?.isDirectory()) { file = path.join(file, 'index.html'); stat = await fs.promises.stat(file).catch(() => null); }
    if (!stat) {
      if (path.extname(url.pathname)) return send(req, res, 404, 'Not found', { 'content-type': 'text/plain' });
      file = path.join(PUBLIC, 'index.html'); // SPA fallback
    }
    const ext = path.extname(file);
    const noCache = ['.html', '.webmanifest'].includes(ext) || file.endsWith('sw.js');
    return send(req, res, 200, await fs.promises.readFile(file), {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': noCache ? 'no-cache' : 'public, max-age=3600',
      ...(file.endsWith('sw.js') ? { 'service-worker-allowed': '/' } : {}),
    });
  } catch (e) {
    log('request error', req.method, req.url, e.stack || e.message);
    return send(req, res, 500, { error: 'Internal error', detail: e.message });
  }
});

server.listen(PORT, HOST, () => {
  log(`SMASH RADAR running → http://localhost:${PORT}  (db: ${path.relative(ROOT, DB)}, auto-refresh: ${AUTO ? 'on' : 'off'})`);
  if (AUTO) {
    setTimeout(tick, 1500);
    setInterval(tick, 30e3);
  }
});

async function shutdown() {
  log('shutting down…');
  server.close();
  await store.save().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function log(...a) { console.log(new Date().toISOString(), '[radar]', ...a); }

function loadEnv(file) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  } catch {}
}
