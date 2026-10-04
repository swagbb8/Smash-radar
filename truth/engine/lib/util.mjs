// Shared helpers for the engine. Zero dependencies (Node 20+).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const UA = 'TheTruthEngine/1.0 (+https://github.com/swagbb8/Smash-radar; research bot; mailto:truth-engine@users.noreply.github.com)';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const now = () => new Date().toISOString();
export const hash = (s, n = 10) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, n);
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const uniq = (a) => [...new Set(a)];
export const log = (...a) => console.log(`[truth ${new Date().toISOString().slice(11, 19)}]`, ...a);

export function slugify(s, max = 60) {
  return String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/g, '');
}

/** Lower-case, strip punctuation/markup, collapse whitespace: used to compare quotes with source text. */
export function norm(s) {
  return String(s || '').normalize('NFKC').replace(/<[^>]+>/g, ' ').replace(/[‘’‚′]/g, "'").replace(/[“”„″]/g, '"').replace(/[‐-―−]/g, '-')
    .toLowerCase().replace(/'/g, '').replace(/[^a-z0-9%.\- ]+/g, ' ').replace(/(\d)\s*%/g, '$1%').replace(/\.(?!\d)/g, ' ').replace(/\s+/g, ' ').trim();
}

export function stripTags(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/\s+/g, ' ').trim();
}

/** Record / replay cache so the pipeline can be developed and tested offline from real recorded responses. */
const CACHE_DIR = process.env.TRUTH_HTTP_CACHE || '';
const CACHE_MODE = process.env.TRUTH_HTTP_MODE || (CACHE_DIR ? 'record' : 'live');      // live | record | replay
const cachePath = (key) => path.join(CACHE_DIR, hash(key, 16) + '.json');

export async function http(url, { method = 'GET', headers = {}, body, timeout = 25000, retries = 2, as = 'text', cacheKey } = {}) {
  const key = cacheKey || `${method} ${url} ${body ? hash(body, 12) : ''}`;
  if (CACHE_DIR && CACHE_MODE === 'replay') {
    const p = cachePath(key);
    if (fs.existsSync(p)) { const c = JSON.parse(fs.readFileSync(p, 'utf8')); return finish(c.status, c.text, as, url); }
    throw new Error(`replay miss: ${key.slice(0, 160)}`);
  }
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetch(url, { method, headers: { 'user-agent': UA, ...headers }, body, signal: AbortSignal.timeout(timeout), redirect: 'follow' });
      if ((r.status === 429 || r.status >= 500) && attempt < retries) { await sleep(1500 * (attempt + 1) + Math.random() * 500); continue; }
      const text = as === 'buffer' ? Buffer.from(await r.arrayBuffer()).toString('base64') : await r.text();
      if (CACHE_DIR && CACHE_MODE === 'record' && as !== 'buffer') { fs.mkdirSync(CACHE_DIR, { recursive: true }); fs.writeFileSync(cachePath(key), JSON.stringify({ key, url, status: r.status, text })); }
      return finish(r.status, text, as, url);
    } catch (e) { lastErr = e; if (attempt < retries) await sleep(1200 * (attempt + 1)); }
  }
  throw new Error(`fetch failed ${url.slice(0, 120)}: ${lastErr?.message || lastErr}`);
}

function finish(status, text, as, url) {
  if (status >= 400) { const e = new Error(`HTTP ${status} ${url.slice(0, 140)}`); e.status = status; e.body = String(text).slice(0, 300); throw e; }
  if (as === 'json') { try { return JSON.parse(text); } catch { throw new Error(`bad JSON from ${url.slice(0, 120)}: ${String(text).slice(0, 120)}`); } }
  if (as === 'buffer') return Buffer.from(text, 'base64');
  return text;
}

export const getJSON = (url, opt = {}) => http(url, { ...opt, as: 'json' });
export const getText = (url, opt = {}) => http(url, { ...opt, as: 'text' });

export function readJSON(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
export function writeJSON(file, data, pretty = false) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, pretty ? JSON.stringify(data, null, 1) : JSON.stringify(data)); }

/** Pull the first JSON object/array out of model text (handles code fences and chatter around it). */
export function extractJSON(text) {
  if (text == null) return null;
  let s = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  try { return JSON.parse(s); } catch {}
  const start = s.search(/[\[{]/); if (start < 0) return null;
  const open = s[start], close = open === '{' ? '}' : ']'; let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true; else if (ch === open) depth++; else if (ch === close) { depth--; if (depth === 0) { try { return JSON.parse(s.slice(start, i + 1)); } catch { return null; } } }
  }
  return null;
}
