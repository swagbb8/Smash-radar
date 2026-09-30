// Collector: fetches due sources, parses, ingests, enriches, records source health + run history.
import fs from 'node:fs';
import { buildSources, TIER_MINUTES } from './config.js';
import { parseXmlFeed, parseNwsAlerts, parseArticleMeta } from './feeds.js';
import { ingest, prune } from './engine.js';
import { mapLimit, truncate, domainOf, canonicalUrl } from './util.js';
import { aiEnrich } from './ai.js';

const UA = 'Mozilla/5.0 (compatible; SmashRadar/1.0; personal news radar; +https://smash-radar.local)';
const FETCH_TIMEOUT = Number(process.env.FETCH_TIMEOUT_MS || 12000);

export function tierMinutes(tier) {
  const env = { fast: process.env.FAST_INTERVAL_MINUTES, normal: process.env.NORMAL_INTERVAL_MINUTES, slow: process.env.SLOW_INTERVAL_MINUTES }[tier];
  return Number(env || TIER_MINUTES[tier] || 20);
}

export async function fetchText(url, { timeout = FETCH_TIMEOUT, maxBytes = 3_000_000, headers = {}, method = 'GET', body } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error(`timeout after ${timeout}ms`)), timeout);
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method, body, signal: ctrl.signal, redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, application/geo+json, application/json, text/html;q=0.8, */*;q=0.5', 'accept-language': 'en-US,en;q=0.9', ...headers },
    });
    if (res.status === 304) return { status: 304, text: '', headers: res.headers, ms: Date.now() - t0, url: res.url };
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      chunks.push(value);
      if (size > maxBytes) { ctrl.abort(); break; }
    }
    return { status: res.status, text: Buffer.concat(chunks).toString('utf8'), headers: res.headers, ms: Date.now() - t0, url: res.url };
  } finally {
    clearTimeout(timer);
  }
}

// Registry = built-in sources + user overrides stored in state (enable/disable, custom feeds).
let fileSources = null;
function baseSources() {
  // SOURCES_FILE lets you replace the built-in registry with your own JSON list (also used by tests).
  if (process.env.SOURCES_FILE) {
    fileSources ||= JSON.parse(fs.readFileSync(process.env.SOURCES_FILE, 'utf8'));
    return fileSources;
  }
  return buildSources();
}

export function getSources(state) {
  const overrides = state.sourceOverrides || {};
  const custom = state.customSources || [];
  return [...baseSources(), ...custom].map((s) => ({ ...s, enabled: overrides[s.id]?.enabled ?? s.enabled ?? true }));
}

async function fetchSource(source, health) {
  const headers = {};
  if (health?.etag) headers['if-none-match'] = health.etag;
  if (health?.lastModified) headers['if-modified-since'] = health.lastModified;
  if (source.type === 'nws') headers.accept = 'application/geo+json';
  const res = await fetchText(source.url, { headers });
  if (res.status === 304) return { items: [], notModified: true, res };
  const items = source.type === 'nws' ? parseNwsAlerts(res.text) : parseXmlFeed(res.text, source);
  if (!items.length && source.type !== 'nws' && !/<(rss|feed|rdf)/i.test(res.text.slice(0, 2000))) {
    throw new Error('Response was not an RSS/Atom feed');
  }
  return { items, res };
}

let running = null;
export function isRefreshing() { return !!running; }

/**
 * @param {{load:Function, save:Function}} store
 * @param {{force?:boolean, trigger?:string, deadlineMs?:number, onEvent?:Function, sourceIds?:string[]}} opts
 */
export async function refresh(store, opts = {}) {
  if (running) return running;
  running = (async () => {
    try { return await doRefresh(store, opts); } finally { running = null; }
  })();
  return running;
}

async function doRefresh(store, { force = false, trigger = 'schedule', deadlineMs = Infinity, onEvent = () => {}, sourceIds = null, sourcesOverride = null } = {}) {
  const startedAt = Date.now();
  const deadline = startedAt + deadlineMs;
  const state = await store.load();
  const sources = (sourcesOverride || getSources(state)).filter((s) => s.enabled !== false && (!sourceIds || sourceIds.includes(s.id)));
  const due = sources.filter((s) => {
    if (force) return true;
    const h = state.sources[s.id];
    if (!h?.lastCheckedAt) return true;
    // back off failing sources: up to 4x interval
    const backoff = Math.min(4, 1 + (h.consecutiveFailures || 0));
    return startedAt - Date.parse(h.lastCheckedAt) >= tierMinutes(s.tier) * 60e3 * backoff - 15e3;
  });
  // fast tier first so breaking/DuPage lands soonest
  const order = { fast: 0, normal: 1, slow: 2 };
  due.sort((a, b) => (order[a.tier] ?? 1) - (order[b.tier] ?? 1));
  const run = { id: `run-${startedAt}`, trigger, startedAt: new Date(startedAt).toISOString(), sourcesChecked: 0, ok: 0, failed: 0, added: 0, changed: 0, duplicates: 0, rejected: 0, enriched: 0, aiEnriched: 0, newIds: [] };
  onEvent({ type: 'refresh:start', total: due.length, trigger });

  const beforeIds = new Set(Object.keys(state.stories));
  await mapLimit(due, Number(process.env.FETCH_CONCURRENCY || 8), async (source) => {
    if (Date.now() > deadline) return;
    const h = (state.sources[source.id] ||= { id: source.id, consecutiveFailures: 0, totalAdded: 0 });
    h.lastCheckedAt = new Date().toISOString();
    run.sourcesChecked++;
    try {
      if (source.type === 'bing') await new Promise((r) => setTimeout(r, 400 + Math.random() * 1600));
      const { items, res, notModified } = await fetchSource(source, h);
      const st = ingest(state, items, source, Date.now());
      h.lastSuccessAt = new Date().toISOString();
      h.lastError = null;
      h.consecutiveFailures = 0;
      h.lastStatus = notModified ? 'not-modified' : 'ok';
      h.lastItemCount = items.length;
      h.lastAdded = st.added;
      h.lastRejected = st.rejected;
      h.totalAdded = (h.totalAdded || 0) + st.added;
      h.latencyMs = res.ms;
      h.etag = res.headers?.get?.('etag') || null;
      h.lastModified = res.headers?.get?.('last-modified') || null;
      run.ok++; run.added += st.added; run.changed += st.changed; run.duplicates += st.duplicates; run.rejected += st.rejected;
      onEvent({ type: 'source', id: source.id, ok: true, added: st.added });
    } catch (e) {
      h.lastError = truncate(e.cause?.message ? `${e.message}: ${e.cause.message}` : e.message || String(e), 200);
      h.lastStatus = 'error';
      h.consecutiveFailures = (h.consecutiveFailures || 0) + 1;
      run.failed++;
      onEvent({ type: 'source', id: source.id, ok: false, error: h.lastError });
    }
  });

  const newStories = Object.values(state.stories).filter((s) => !beforeIds.has(s.id));
  run.newIds = newStories.map((s) => s.id).slice(0, 200);

  // Enrichment: real article images + better summaries (bounded per run).
  if (process.env.ENRICH !== 'off') {
    const limit = Number(process.env.ENRICH_LIMIT || 40);
    const pending = Object.values(state.stories)
      .filter((s) => s.needsEnrich && !s.enrichTried)
      .sort((a, b) => Date.parse(b.publishedAt || b.firstDiscoveredAt) - Date.parse(a.publishedAt || a.firstDiscoveredAt));
    const isGoogle = (s) => /news\.google\.com/.test(s.link);
    const direct = pending.filter((s) => !isGoogle(s));
    const google = pending.filter(isGoogle);
    const gShare = Math.min(google.length, Math.ceil(limit / 4));
    const queue = [...direct.slice(0, limit - gShare), ...google.slice(0, gShare)];
    run.enrichAttempts = queue.length;
    onEvent({ type: 'enrich:start', total: queue.length });
    await mapLimit(queue, 6, async (s) => {
      if (Date.now() > deadline - 3000) return;
      const ok = await enrichStory(s);
      if (ok) run.enriched++;
      if (/news\.google\.com/.test(s.link) === false && s.enrichGoogle) run.googleDecoded = (run.googleDecoded || 0) + 1;
    });
  }
  if (Date.now() < deadline - 8000) {
    try { run.aiEnriched = await aiEnrich(newStories); } catch (e) { run.aiError = e.message; }
  }

  run.pruned = prune(state);
  run.finishedAt = new Date().toISOString();
  run.durationMs = Date.now() - startedAt;
  state.meta.lastRefreshAt = run.finishedAt;
  if (force || due.length === sources.length) state.meta.lastFullRefreshAt = run.finishedAt;
  state.runs = [{ ...run, newIds: undefined, newCount: run.newIds.length }, ...(state.runs || [])].slice(0, 50);
  await store.save(state);
  onEvent({ type: 'refresh:done', run: state.runs[0] });
  return state.runs[0];
}

// ---------- enrichment ----------
export async function enrichStory(s) {
  s.enrichTried = true;
  try {
    let target = s.link;
    if (/news\.google\.com\/rss\/articles\//.test(target)) {
      const decoded = await decodeGoogleNewsUrl(target);
      if (!decoded) return false;
      s.enrichGoogle = true;
      s.link = decoded;
      s.url = canonicalUrl(decoded);
      s.sourceDomain = domainOf(decoded);
      target = decoded;
    }
    const res = await fetchText(target, { timeout: 8000, maxBytes: 600_000, headers: { accept: 'text/html,application/xhtml+xml' } });
    const meta = parseArticleMeta(res.text, res.url || target);
    let changed = false;
    if (meta.image && (!s.imageUrl || /bing\.com\/th/.test(s.imageUrl)) && !/logo|placeholder|default[-_]?(image|og)/i.test(meta.image)) { s.imageUrl = meta.image; changed = true; }
    if (meta.description && (!s.summary || s.summary.length < 70) && meta.description.length > (s.summary?.length || 0)) {
      s.summary = truncate(meta.description, 420);
      s.enrichedSummary = true;
      changed = true;
    }
    if (!s.publishedAt && meta.published) s.publishedAt = meta.published;
    s.needsEnrich = false;
    s.enrichedAt = new Date().toISOString();
    return changed;
  } catch {
    return false;
  }
}

// Google News RSS links are opaque redirects. Resolve them to the publisher URL when possible.
export async function decodeGoogleNewsUrl(link) {
  try {
    const u = new URL(link);
    const id = u.pathname.split('/').pop();
    // Legacy format: the URL is embedded in the base64 payload.
    const raw = Buffer.from(id.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('latin1');
    const direct = raw.match(/https?:\/\/[\x21-\x7e]+/);
    if (direct && !raw.startsWith('\x08\x13"\x02AU_')) return direct[0].replace(/[\x00-\x1f].*$/, '');
    // Current format: needs signature + timestamp from the article page, then a batchexecute call.
    let sg = null; let ts = null;
    for (const base of ['https://news.google.com/articles/', 'https://news.google.com/rss/articles/']) {
      const page = await fetchText(`${base}${id}?hl=en-US&gl=US&ceid=US:en`, { timeout: 7000, maxBytes: 600_000, headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36' } }).catch(() => null);
      sg = page?.text.match(/data-n-a-sg="([^"]+)"/)?.[1];
      ts = page?.text.match(/data-n-a-ts="([^"]+)"/)?.[1];
      if (sg && ts) break;
    }
    if (!sg || !ts) return null;
    const inner = JSON.stringify(['garturlreq', [['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1], 'X', 'X', 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0], id, Number(ts), sg]);
    const body = `f.req=${encodeURIComponent(JSON.stringify([[['Fbv4je', inner]]]))}`;
    const r = await fetchText('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
      method: 'POST', body, timeout: 7000, headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    });
    const m = r.text.match(/\\"garturlres\\",\\"(https?:[^\\"]+)\\"/);
    return m ? m[1].replace(/\\\\u003d/g, '=').replace(/\\\\u0026/g, '&') : null;
  } catch {
    return null;
  }
}

// Live web search: run Bing + Google News for an arbitrary query and ingest results.
export async function liveSearch(store, q) {
  const { bingUrl, googleUrl } = await import('./config.js');
  const state = await store.load();
  const srcs = [
    { id: 'search-bing', name: 'Bing News search', url: bingUrl(q), type: 'bing', category: 'news', reliability: 3, official: false },
    { id: 'search-google', name: 'Google News search', url: googleUrl(q, '7d'), type: 'google', category: 'news', reliability: 3, official: false },
  ];
  const results = await mapLimit(srcs, 2, async (s) => {
    const res = await fetchText(s.url);
    return { s, items: parseXmlFeed(res.text, s) };
  });
  let added = 0;
  const errors = [];
  for (const r of results) {
    if (r?.error) { errors.push(r.error.message); continue; }
    added += ingest(state, r.items, r.s).added;
  }
  const fresh = Object.values(state.stories).filter((s) => s.needsEnrich && !s.enrichTried).slice(0, 12);
  await mapLimit(fresh, 6, enrichStory);
  await store.save(state);
  return { added, errors };
}
