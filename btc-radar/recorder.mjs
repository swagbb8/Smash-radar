// BTC Radar recorder: records every BTC 5m and 15m Polymarket window around the clock
// (Chainlink price, Coinbase price, both order books every 2s, and the official result)
// so the Radar page can backtest its signal engine on real data.
//
// Output: <DATA_DIR>/YYYY-MM-DD.json (array of finished windows) + index.json.
// Every SAVE_EVERY seconds it writes files and, if PUSH=1, force-pushes DATA_DIR as a
// single-commit branch (keeps the last KEEP_DAYS days, no history bloat).
//
// env: DATA_DIR (default ./btc-data), RUN_SECONDS (default 21000), PUSH, BRANCH, KEEP_DAYS, SAVE_EVERY
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import WebSocket from 'ws';

const DATA_DIR = path.resolve(process.env.DATA_DIR || 'btc-data');
const RUN_SECONDS = +process.env.RUN_SECONDS || 21000;
const SAVE_EVERY = +process.env.SAVE_EVERY || 600;
const KEEP_DAYS = +process.env.KEEP_DAYS || 7;
const BRANCH = process.env.BRANCH || 'btc-radar-data';
const PUSH = process.env.PUSH === '1';
const TF = [{ key: '5m', dur: 300 }, { key: '15m', dur: 900 }];

// proxy support for local runs (GitHub runners don't need it)
const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy;
let wsAgent;
if (PROXY) {
  const { HttpsProxyAgent } = await import('https-proxy-agent');
  const { ProxyAgent, setGlobalDispatcher } = await import('undici');
  wsAgent = new HttpsProxyAgent(PROXY);
  setGlobalDispatcher(new ProxyAgent(PROXY));
}
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const r2 = (v) => v == null ? null : Math.round(v * 100) / 100;
const r0 = (v) => v == null ? null : Math.round(v);

// ---- state ----
const cl = [];                 // [{t, v}] Chainlink (Polymarket live data), last 20 min
let cb = null, cbT = 0;        // Coinbase last trade
const live = {};               // key -> current window record
const pending = [];            // finished windows waiting for the official result
const days = {};               // 'YYYY-MM-DD' -> [windows]

// load what's already saved so restarts keep accumulating
fs.mkdirSync(DATA_DIR, { recursive: true });
for (const f of fs.readdirSync(DATA_DIR)) {
  if (/^\d{4}-\d{2}-\d{2}\.json$/.test(f)) { try { days[f.slice(0, 10)] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')); } catch {} }
}
log('loaded days:', Object.keys(days).join(', ') || 'none');

// ---- feeds ----
function connectCL() {
  const ws = new WebSocket('wss://ws-live-data.polymarket.com', { agent: wsAgent });
  let ping;
  ws.on('open', () => {
    ws.send(JSON.stringify({ action: 'subscribe', subscriptions: [{ topic: 'crypto_prices_chainlink', type: '*', filters: '{"symbol":"btc/usd"}' }] }));
    ping = setInterval(() => ws.readyState === 1 && ws.send('PING'), 5000);
    log('chainlink connected');
  });
  ws.on('message', (buf) => {
    const s = buf.toString(); if (s[0] !== '{') return;
    let d; try { d = JSON.parse(s); } catch { return; }
    const p = d.payload || {};
    if (Array.isArray(p.data)) p.data.forEach(x => addCL(x.timestamp, x.value));
    else if (p.value != null && p.timestamp) addCL(p.timestamp, p.value);
  });
  ws.on('close', () => { clearInterval(ping); setTimeout(connectCL, 2000); });
  ws.on('error', () => ws.close());
}
function addCL(t, v) {
  v = +v; if (!isFinite(v)) return;
  const last = cl[cl.length - 1];
  if (last && t <= last.t) { if (t === last.t) last.v = v; return; }
  cl.push({ t, v });
  const cut = Date.now() - 20 * 60 * 1000; while (cl.length && cl[0].t < cut) cl.shift();
  for (const k in live) setOpen(live[k]);
}
function connectCB() {
  const ws = new WebSocket('wss://ws-feed.exchange.coinbase.com', { agent: wsAgent });
  ws.on('open', () => { ws.send(JSON.stringify({ type: 'subscribe', product_ids: ['BTC-USD'], channels: ['ticker'] })); log('coinbase connected'); });
  ws.on('message', (buf) => { let d; try { d = JSON.parse(buf.toString()); } catch { return; } if (d.type === 'ticker' && d.price) { cb = +d.price; cbT = Date.now(); } });
  ws.on('close', () => setTimeout(connectCB, 2000));
  ws.on('error', () => ws.close());
}

async function getJSON(url) { const r = await fetch(url, { signal: AbortSignal.timeout(8000) }); if (!r.ok) throw new Error(r.status + ' ' + url); return r.json(); }

function readBook(b) {
  const asks = (b.asks || []).map(x => ({ p: +x.price, s: +x.size })).sort((a, z) => a.p - z.p);
  const bids = (b.bids || []).map(x => ({ p: +x.price, s: +x.size })).sort((a, z) => z.p - a.p);
  const ask = asks.length ? asks[0].p : null, bid = bids.length ? bids[0].p : null;
  let room = 0, askD = 0, bidD = 0;
  for (const a of asks) { if (a.p <= ask + 0.0201) room += a.p * a.s; if (a.p <= ask + 0.0501) askD += a.s; }
  for (const x of bids) if (x.p >= bid - 0.0501) bidD += x.s;
  return { ask, bid, room, askD, bidD };
}

// ---- windows ----
function setOpen(w) {
  if (w.open != null) return;
  const t0 = w.T * 1000;
  const hit = cl.find(p => p.t >= t0 && p.t - t0 <= 2000);
  if (hit) w.open = hit.v;
}
async function loadTokens(w) {
  for (let i = 0; i < 10 && !w.up; i++) {
    try {
      const ev = (await getJSON('https://gamma-api.polymarket.com/events?slug=' + w.slug))[0];
      if (ev) { const m = ev.markets[0]; const o = JSON.parse(m.outcomes), t = JSON.parse(m.clobTokenIds); w.up = t[o.indexOf('Up')]; w.dn = t[o.indexOf('Down')]; }
    } catch (e) { /* retry */ }
    if (!w.up) await new Promise(r => setTimeout(r, 3000));
  }
}
function newWindow(tf, T) {
  const w = { key: tf.key, dur: tf.dur, T, slug: `btc-updown-${tf.key}-${T}`, open: null, outcome: null, rows: [], up: null, dn: null };
  setOpen(w); loadTokens(w);
  return w;
}
function finish(w) {
  if (w.open == null || w.rows.length < 20) { log('dropped', w.slug, 'open', w.open, 'rows', w.rows.length); return; }
  w.doneAt = Date.now();
  pending.push(w);
}

async function tick() {
  const now = Date.now();
  for (const tf of TF) {
    const T = Math.floor(now / 1000 / tf.dur) * tf.dur;
    if (!live[tf.key] || live[tf.key].T !== T) { if (live[tf.key]) finish(live[tf.key]); live[tf.key] = newWindow(tf, T); }
  }
  const last = cl[cl.length - 1];
  await Promise.all(Object.values(live).map(async (w) => {
    let u = null, d = null;
    if (w.up) { try { [u, d] = (await Promise.all([w.up, w.dn].map(t => getJSON('https://clob.polymarket.com/book?token_id=' + t)))).map(readBook); } catch {} }
    const sec = Math.round((Date.now() / 1000 - w.T) * 10) / 10;
    if (sec < 0 || sec > w.dur) return;
    w.rows.push([sec, last && Date.now() - last.t < 5000 ? r2(last.v) : null, cb && Date.now() - cbT < 5000 ? r2(cb) : null,
      u ? u.ask : null, u ? u.bid : null, d ? d.ask : null, d ? d.bid : null,
      u ? r0(u.room) : null, d ? r0(d.room) : null, u ? r0(u.bidD) : null, u ? r0(u.askD) : null, d ? r0(d.bidD) : null, d ? r0(d.askD) : null]);
  }));
}

async function resolvePending() {
  for (let i = pending.length - 1; i >= 0; i--) {
    const w = pending[i];
    try {
      const m = (await getJSON('https://gamma-api.polymarket.com/events?slug=' + w.slug))[0].markets[0];
      const op = JSON.parse(m.outcomePrices).map(Number), o = JSON.parse(m.outcomes);
      if (m.umaResolutionStatus === 'resolved' || (op.includes(1) && op.includes(0))) {
        w.outcome = o[op.indexOf(1)] === 'Up' ? 'up' : 'down'; w.outcomeSrc = 'polymarket';
      }
    } catch {}
    if (!w.outcome && Date.now() - w.doneAt > 20 * 60 * 1000) { pending.splice(i, 1); log('no result for', w.slug); continue; }
    if (w.outcome) {
      pending.splice(i, 1);
      const day = new Date(w.T * 1000).toISOString().slice(0, 10);
      (days[day] ||= []).push({ key: w.key, dur: w.dur, T: w.T, slug: w.slug, open: r2(w.open), outcome: w.outcome, rows: w.rows });
      log('saved', w.slug, w.outcome, w.rows.length, 'rows');
    }
  }
}

function save() {
  const keep = Object.keys(days).sort().slice(-KEEP_DAYS);
  for (const d of Object.keys(days)) if (!keep.includes(d)) { delete days[d]; try { fs.unlinkSync(path.join(DATA_DIR, d + '.json')); } catch {} }
  for (const d of keep) fs.writeFileSync(path.join(DATA_DIR, d + '.json'), JSON.stringify(days[d]));
  const index = { updated: new Date().toISOString(), days: keep.map(d => ({ day: d, windows: days[d].length })) };
  fs.writeFileSync(path.join(DATA_DIR, 'index.json'), JSON.stringify(index));
  if (!PUSH) { log('saved files', keep.join(',')); return; }
  try {
    const sh = (c) => execSync(c, { cwd: DATA_DIR, stdio: 'pipe' }).toString();
    sh('rm -rf .git && git init -q -b ' + BRANCH);
    sh('git config user.name "btc-radar-bot" && git config user.email "41898283+github-actions[bot]@users.noreply.github.com"');
    sh('git add -A && git commit -qm "btc radar data ' + index.updated + '"');
    sh(`git push -q --force "https://x-access-token:${process.env.GH_TOKEN}@github.com/${process.env.REPO}.git" ${BRANCH}`);
    sh('rm -rf .git');
    log('pushed', keep.map(d => d + ':' + days[d].length).join(' '));
  } catch (e) { log('push failed', String(e.stderr || e.message).slice(0, 200)); }
}

connectCL(); connectCB();
const started = Date.now();
let lastSave = Date.now();
while (Date.now() - started < RUN_SECONDS * 1000) {
  const t0 = Date.now();
  try { await tick(); } catch (e) { log('tick error', e.message); }
  if (Math.floor(t0 / 20000) !== Math.floor((t0 - 2000) / 20000)) resolvePending().catch(() => {});
  if (Date.now() - lastSave > SAVE_EVERY * 1000) { lastSave = Date.now(); save(); }
  await new Promise(r => setTimeout(r, Math.max(100, 2000 - (Date.now() - t0))));
}
// finish up: wait for results of what's pending (up to 3 min), then save
for (let i = 0; i < 9 && pending.length; i++) { await resolvePending(); await new Promise(r => setTimeout(r, 20000)); }
save();
process.exit(0);
