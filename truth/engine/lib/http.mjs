// HTTP helper for the engine: polite user agent, timeouts, retries, and an optional record/replay cache so the
// whole pipeline can be tested offline against real responses captured on a GitHub runner.
//   TRUTH_HTTP_MODE = live (default) | record (live + save) | replay (only from cache; missing = error)
//   TRUTH_HTTP_CACHE = directory for the cache (default: .http-cache)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const UA = 'TheTruthEngine/1.0 (+https://github.com/swagbb8/Smash-radar; research bot; mailto:truth-engine@users.noreply.github.com)';
const MODE = () => process.env.TRUTH_HTTP_MODE || 'live';
const DIR = () => process.env.TRUTH_HTTP_CACHE || '.http-cache';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const stats = { requests: 0, cached: 0, failures: 0, byHost: {}, failedByHost: {} };

function keyOf(url, init) { return crypto.createHash('sha1').update(`${init?.method || 'GET'} ${url} ${init?.body || ''}`).digest('hex'); }

/** fetch → { status, ok, text, type, headers } with retries on 429 / 5xx / network errors. Never throws on HTTP status. */
export async function http(url, init = {}, { timeout = 25000, retries = 2, cache = true, binary = false } = {}) {
  const mode = MODE(); const file = path.join(DIR(), keyOf(url, init) + '.json');
  if (cache && mode !== 'live' && fs.existsSync(file)) {
    const j = JSON.parse(fs.readFileSync(file, 'utf8')); stats.cached++;
    return { ...j, ok: j.status >= 200 && j.status < 300, buffer: j.b64 ? Buffer.from(j.b64, 'base64') : null, fromCache: true };
  }
  if (mode === 'replay') return { status: 599, ok: false, text: '', type: '', headers: {}, error: 'not in replay cache: ' + url };
  const host = (() => { try { return new URL(url).host; } catch { return '?'; } })();
  let last = { status: 598, ok: false, text: '', type: '', headers: {}, error: 'no attempt' };
  for (let a = 0; a <= retries; a++) {
    try {
      stats.requests++; stats.byHost[host] = (stats.byHost[host] || 0) + 1;
      const r = await fetch(url, { ...init, headers: { 'user-agent': UA, accept: 'application/json, text/plain, */*', ...(init.headers || {}) }, signal: AbortSignal.timeout(timeout) });
      const type = r.headers.get('content-type') || ''; const headers = {};
      for (const k of ['retry-after', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'content-length', 'last-modified', 'etag']) if (r.headers.get(k)) headers[k] = r.headers.get(k);
      let text = '', buffer = null;
      if (binary) buffer = Buffer.from(await r.arrayBuffer()); else text = await r.text();
      last = { status: r.status, ok: r.ok, text, buffer, type, headers };
      if (r.status === 429 || r.status >= 500) { stats.failures++; stats.failedByHost[host] = (stats.failedByHost[host] || 0) + 1; if (a < retries) { await sleep(Math.min(20000, (Number(headers['retry-after']) || 2 ** a * 1.5) * 1000)); continue; } }
      break;
    } catch (e) {
      stats.failures++; stats.failedByHost[host] = (stats.failedByHost[host] || 0) + 1; last = { status: 598, ok: false, text: '', type: '', headers: {}, error: String(e.cause?.code || e.message || e) };
      if (a < retries) await sleep(1200 * (a + 1));
    }
  }
  if (cache && mode === 'record' && last.status < 500) {
    fs.mkdirSync(DIR(), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ url, status: last.status, type: last.type, headers: last.headers, text: last.text, b64: last.buffer ? last.buffer.toString('base64') : undefined }));
  }
  return last;
}

export async function getJSON(url, init, opt) {
  const r = await http(url, init, opt);
  if (!r.ok) return { ok: false, status: r.status, error: r.error || r.text.slice(0, 200), data: null };
  try { return { ok: true, status: r.status, data: JSON.parse(r.text) }; } catch (e) { return { ok: false, status: r.status, error: 'bad JSON: ' + r.text.slice(0, 120), data: null }; }
}
export async function getText(url, init, opt) { const r = await http(url, init, opt); return { ok: r.ok, status: r.status, error: r.error, text: r.text }; }
export const qs = (o) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
