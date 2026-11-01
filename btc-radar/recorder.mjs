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
import { createRequire } from 'node:module';
const E = createRequire(import.meta.url)('../pages-extra/btc5m/engine.js');

const DATA_DIR = path.resolve(process.env.DATA_DIR || 'btc-data');
const RUN_SECONDS = +process.env.RUN_SECONDS || 21000;
const SAVE_EVERY = +process.env.SAVE_EVERY || 600;
const KEEP_DAYS = +process.env.KEEP_DAYS || 14;
const TRAIN_EVERY = +process.env.TRAIN_EVERY || 3600;
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
const ex = {};                 // exchange -> {v, t}: cb, kr
let exBasis = null;            // usual gap between exchange median and Chainlink
let krImb = 0, krT = 0;        // Kraken top-of-book imbalance (-1..1)
const perp = {};               // drbPrem, drbFund, hlPrem, hlFund (+ t)
let model = null;              // current ensemble (from model.json)
const live = {};               // key -> current window record
const pending = [];            // finished windows waiting for the official result
const days = {};               // 'YYYY-MM-DD' -> [windows]

// load what's already saved so restarts keep accumulating
fs.mkdirSync(DATA_DIR, { recursive: true });
for (const f of fs.readdirSync(DATA_DIR)) {
  if (/^\d{4}-\d{2}-\d{2}\.json$/.test(f)) { try { days[f.slice(0, 10)] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')); } catch {} }
}
log('loaded days:', Object.keys(days).join(', ') || 'none');
try { model = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'model.json'), 'utf8')); log('model', model.version, model.validated ? 'validated' : 'not validated'); } catch { log('no model yet'); }
const liveModel = () => (model && model.validated ? model : E.DEFAULT_MODEL);

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
  const xs = Object.values(ex).filter(e => Date.now() - e.t < 3000).map(e => e.v);
  if (xs.length) { xs.sort((a, b) => a - b); const med = xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2; const d = med - v; exBasis = exBasis == null ? d : exBasis + (d - exBasis) * 0.02; }
}

// Kraken: ticker (price) + 25-level book (pressure)
function connectKraken() {
  const ws = new WebSocket('wss://ws.kraken.com/v2', { agent: wsAgent });
  const bids = new Map(), asks = new Map();
  ws.on('open', () => {
    ws.send(JSON.stringify({ method: 'subscribe', params: { channel: 'ticker', symbol: ['BTC/USD'] } }));
    ws.send(JSON.stringify({ method: 'subscribe', params: { channel: 'book', symbol: ['BTC/USD'], depth: 25 } }));
    log('kraken connected');
  });
  ws.on('message', (buf) => {
    let d; try { d = JSON.parse(buf.toString()); } catch { return; }
    if (d.channel === 'ticker' && d.data && d.data[0]) { const t = d.data[0]; if (t.bid && t.ask) ex.kr = { v: (t.bid + t.ask) / 2, t: Date.now() }; }
    if (d.channel === 'book' && d.data && d.data[0]) {
      const b = d.data[0]; if (d.type === 'snapshot') { bids.clear(); asks.clear(); }
      for (const l of b.bids || []) l.qty > 0 ? bids.set(l.price, l.qty) : bids.delete(l.price);
      for (const l of b.asks || []) l.qty > 0 ? asks.set(l.price, l.qty) : asks.delete(l.price);
      const bb = [...bids.keys()].sort((x, y) => y - x).slice(0, 10).reduce((a, k) => a + bids.get(k), 0);
      const aa = [...asks.keys()].sort((x, y) => x - y).slice(0, 10).reduce((a, k) => a + asks.get(k), 0);
      if (bb + aa > 0) { krImb = (bb - aa) / (bb + aa); krT = Date.now(); }
      if (bids.size && asks.size) ex.kr = { v: (Math.max(...bids.keys()) + Math.min(...asks.keys())) / 2, t: Date.now() };
    }
  });
  ws.on('close', () => setTimeout(connectKraken, 2000));
  ws.on('error', () => ws.close());
}
// Deribit BTC perpetual: mark vs index (premium) and 8h funding
function connectDeribit() {
  const ws = new WebSocket('wss://www.deribit.com/ws/api/v2', { agent: wsAgent });
  let hb;
  ws.on('open', () => { ws.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'public/subscribe', params: { channels: ['ticker.BTC-PERPETUAL.1000ms'] } })); hb = setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'public/test' })), 20000); log('deribit connected'); });
  ws.on('message', (buf) => {
    let d; try { d = JSON.parse(buf.toString()); } catch { return; }
    const x = d.params && d.params.data; if (!x || !x.index_price) return;
    perp.drbPrem = x.mark_price / x.index_price - 1; perp.drbFund = x.funding_8h; perp.drbT = Date.now();
  });
  ws.on('close', () => { clearInterval(hb); setTimeout(connectDeribit, 2000); });
  ws.on('error', () => ws.close());
}
// Hyperliquid BTC perp: premium + funding
function connectHL() {
  const ws = new WebSocket('wss://api.hyperliquid.xyz/ws', { agent: wsAgent });
  let ping;
  ws.on('open', () => { ws.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'activeAssetCtx', coin: 'BTC' } })); ping = setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ method: 'ping' })), 30000); log('hyperliquid connected'); });
  ws.on('message', (buf) => {
    let d; try { d = JSON.parse(buf.toString()); } catch { return; }
    const c = d.channel === 'activeAssetCtx' && d.data && d.data.ctx; if (!c) return;
    perp.hlPrem = +c.premium; perp.hlFund = +c.funding; perp.hlT = Date.now();
  });
  ws.on('close', () => { clearInterval(ping); setTimeout(connectHL, 2000); });
  ws.on('error', () => ws.close());
}
function connectCB() {
  const ws = new WebSocket('wss://ws-feed.exchange.coinbase.com', { agent: wsAgent });
  ws.on('open', () => { ws.send(JSON.stringify({ type: 'subscribe', product_ids: ['BTC-USD'], channels: ['ticker'] })); log('coinbase connected'); });
  ws.on('message', (buf) => { let d; try { d = JSON.parse(buf.toString()); } catch { return; } if (d.type === 'ticker' && d.price) { cb = +d.price; cbT = Date.now(); ex.cb = { v: cb, t: cbT }; } });
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
    if (w.up) { try { const raw = await Promise.all([w.up, w.dn].map(t => getJSON('https://clob.polymarket.com/book?token_id=' + t))); w.raw = { up: raw[0], dn: raw[1] }; [u, d] = raw.map(readBook); } catch {} }
    const sec = Math.round((Date.now() / 1000 - w.T) * 10) / 10;
    if (sec < 0 || sec > w.dur) return;
    w.rows.push([sec, last && Date.now() - last.t < 5000 ? r2(last.v) : null, cb && Date.now() - cbT < 5000 ? r2(cb) : null,
      u ? u.ask : null, u ? u.bid : null, d ? d.ask : null, d ? d.bid : null,
      u ? r0(u.room) : null, d ? r0(d.room) : null, u ? r0(u.bidD) : null, u ? r0(u.askD) : null, d ? r0(d.bidD) : null, d ? r0(d.askD) : null,
      ex.kr && Date.now() - ex.kr.t < 5000 ? r2(ex.kr.v) : null, Date.now() - krT < 5000 ? Math.round(krImb * 1000) / 1000 : null,
      Date.now() - (perp.drbT || 0) < 10000 ? +perp.drbPrem.toFixed(6) : null, Date.now() - (perp.drbT || 0) < 10000 ? perp.drbFund : null,
      Date.now() - (perp.hlT || 0) < 60000 ? +perp.hlPrem.toFixed(6) : null, Date.now() - (perp.hlT || 0) < 60000 ? perp.hlFund : null]);
    if (u) { w.book = { up: E.readBook(w.raw.up, 10), dn: E.readBook(w.raw.dn, 10) }; w.bookT = Date.now(); }
    logPrediction(w, sec);
    if (u) paperTick(w);
  }));
}

// ---- permanent prediction log: written BEFORE the outcome is known, never edited ----
function appendLog(obj) {
  const day = new Date().toISOString().slice(0, 10), dir = path.join(DATA_DIR, 'predlog');
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, day + '.jsonl'), JSON.stringify(obj) + '\n');
}
function logPrediction(w, sec) {
  if (w.open == null || !w.book) return;
  const left = w.dur - sec;
  for (const cp of [120, 60, 30]) {
    if ((w.logged ||= {})[cp] || left > cp || left <= cp - 6) continue;
    w.logged[cp] = 1;
    E.setModel(liveModel());
    const m = { key: w.key, slug: w.slug, dur: w.dur, T: w.T, open: w.open, openExact: true, book: w.book };
    const ctx = { now: Date.now(), cl, ex, exBasis, krImb, bookT: w.bookT, perp };
    const run = E.runEngines(m, ctx); if (!run) continue;
    const rec = { ts: new Date(ctx.now).toISOString(), t: ctx.now, slug: w.slug, key: w.key, left: cp, model: run.model, engine: E.VERSION,
      pEns: +run.pUp.toFixed(4), engines: Object.fromEntries(Object.entries(run.engines).map(([k, v]) => [k, v.p == null ? null : +v.p.toFixed(4)])),
      x: run.x.map(v => +v.toFixed(4)), regime: run.regime.key, lead: +run.lead.toFixed(2), disagree: +run.disagree.toFixed(4),
      anomalies: run.anomalies.map(a => a.msg), asof: run.asof };
    appendLog(rec); (w.preds ||= []).push(rec);
  }
}
let trainedOn = -1;
function train() {
  const all = Object.keys(days).sort().flatMap(d => days[d]);
  if (all.length === trainedOn) return;   // nothing new to learn from
  trainedOn = all.length;
  const t0 = Date.now();
  const m = E.train(all, model && model.version);
  m.trainMs = Date.now() - t0; m.windows = all.length;
  fs.mkdirSync(path.join(DATA_DIR, 'models'), { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, 'models', m.version + '.json'), JSON.stringify(m));
  fs.writeFileSync(path.join(DATA_DIR, 'model.json'), JSON.stringify(m));
  model = m;
  const wf = m.walkForward;
  log('trained', m.version, 'windows', all.length, 'samples', m.samples, wf.enough ? `OOS brier ${wf.test.competitor} ${wf.overall[wf.test.competitor].brier.toFixed(4)} vs market ${wf.overall.mkt.brier.toFixed(4)}, CI90 [${wf.test.ci90.map(v => v.toFixed(4)).join(', ')}]` : 'not enough data', m.validated ? 'VALIDATED' : '', m.trainMs + 'ms');
}

// ---- generic append-only logs ----
function appendFile(dirName, obj) {
  const dir = path.join(DATA_DIR, dirName); fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, new Date().toISOString().slice(0, 10) + '.jsonl'), JSON.stringify(obj) + '\n');
}
function readAll(dirName) {
  const dir = path.join(DATA_DIR, dirName), out = [];
  try { for (const f of fs.readdirSync(dir).sort()) for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) if (line.trim()) { try { out.push(JSON.parse(line)); } catch {} } } catch {}
  return out;
}

// ---- Polymarket performance: 24/7 paper trading on executable prices ----
// Every qualifying setup is "bought" by walking the real ask book for $STAKE (slippage), paying
// the taker fee, and exited at take-profit/stop by walking the real bids, or held to settlement.
const STAKE = 10;
const trades = new Map();      // id -> trade (open and closed), rebuilt from the ledger on start
const invs = readAll('investigations');
for (const ev of readAll('ledger')) { if (ev.type === 'open') trades.set(ev.id, { ...ev, status: 'open' }); else if (ev.type === 'close' && trades.has(ev.id)) Object.assign(trades.get(ev.id), ev, { status: 'closed' }); }
log('ledger trades loaded', trades.size, 'investigations', invs.length);

function paperTick(w) {
  if (w.open == null || !w.raw) return;
  E.setModel(liveModel());
  const m = { key: w.key, slug: w.slug, dur: w.dur, T: w.T, open: w.open, openExact: true, book: w.book };
  const ctx = { now: Date.now(), cl, ex, exBasis, krImb, bookT: w.bookT, perp };
  for (const mode of ['standard', 'longshot']) {
    const id = mode + ':' + w.slug;
    const tr = trades.get(id);
    if (!tr) {
      const ev = E.evaluate(m, ctx, { stake: STAKE, mode });
      const b = ev.best; if (!b) continue;
      const fill = E.vwapBuy((b.side === 'up' ? w.raw.up : w.raw.dn).asks || [], STAKE);
      if (!fill || !fill.complete) { continue; }
      const t = { type: 'open', id, mode, slug: w.slug, key: w.key, side: b.side, ts: new Date().toISOString(), left: Math.round(b.left),
        bestAsk: fill.best, fillAvg: +fill.avg.toFixed(4), slippage: +fill.slippage.toFixed(4), shares: +fill.shares.toFixed(4), spent: STAKE,
        entryFee: +E.fee(fill.shares, fill.avg).toFixed(4), pModel: +b.p.toFixed(4), edge: +b.edge.toFixed(4), tp: b.tp, sl: b.sl,
        regime: ev.run.regime.key, model: ev.run.model };
      trades.set(id, { ...t, status: 'open' }); appendFile('ledger', t);
      log('paper OPEN', mode, w.slug, b.side, 'fill', t.fillAvg, 'slip', t.slippage);
    } else if (tr.status === 'open') {
      const bids = ((tr.side === 'up' ? w.raw.up : w.raw.dn).bids || []);
      const best = bids.length ? Math.max(...bids.map(x => +x.price)) : null;
      if (best == null) continue;
      let why = null;
      if (best >= tr.tp) why = 'take profit'; else if (tr.sl != null && best <= tr.sl) why = 'stop';
      if (!why) continue;
      const sell = E.vwapSell(bids, tr.shares); if (!sell) continue;
      const exitFee = E.fee(sell.sold, sell.avg);
      closeTrade(tr, why, { exitAvg: +sell.avg.toFixed(4), exitBest: sell.best, exitSlippage: +sell.slippage.toFixed(4), exitFee: +exitFee.toFixed(4),
        pnl: +(sell.proceeds - exitFee - tr.spent - tr.entryFee).toFixed(4) });
    }
  }
}
function closeTrade(tr, exit, extra) {
  const ev = { type: 'close', id: tr.id, ts: new Date().toISOString(), exit, ...extra };
  Object.assign(tr, ev, { status: 'closed' }); appendFile('ledger', ev);
  log('paper CLOSE', tr.mode, tr.slug, exit, 'pnl', ev.pnl);
}
function settleTrades(slug, outcome) {
  for (const tr of trades.values()) {
    if (tr.slug !== slug || tr.status !== 'open') continue;
    const won = (outcome === 'up') === (tr.side === 'up');
    closeTrade(tr, won ? 'settled win' : 'settled loss', { exitAvg: won ? 1 : 0, exitFee: 0, pnl: +((won ? tr.shares : 0) - tr.spent - tr.entryFee).toFixed(4), outcome });
  }
}
// trades left open by a previous run (restart mid-window) get settled from the official result
async function settleOrphans() {
  for (const tr of trades.values()) {
    if (tr.status !== 'open' || Object.values(live).some(w => w.slug === tr.slug) || pending.some(w => w.slug === tr.slug)) continue;
    try {
      const m = (await getJSON('https://gamma-api.polymarket.com/events?slug=' + tr.slug))[0].markets[0];
      const op = JSON.parse(m.outcomePrices).map(Number), o = JSON.parse(m.outcomes);
      if (m.umaResolutionStatus === 'resolved' || (op.includes(1) && op.includes(0))) settleTrades(tr.slug, o[op.indexOf(1)] === 'Up' ? 'up' : 'down');
    } catch {}
  }
}

// ---- summaries the dashboard reads ----
function perfSummary() {
  const out = { updated: new Date().toISOString(), stake: STAKE, modes: {} };
  for (const mode of ['standard', 'longshot']) {
    const all = [...trades.values()].filter(t => t.mode === mode), done = all.filter(t => t.status === 'closed' && t.pnl != null);
    const sum = (f) => done.reduce((a, t) => a + (f(t) || 0), 0);
    const wins = done.filter(t => t.pnl > 0).length;
    let eq = 0; const curve = done.map(t => +(eq += t.pnl).toFixed(2));
    out.modes[mode] = { trades: done.length, open: all.length - done.length, wins, winRate: done.length ? wins / done.length : null,
      pnl: +sum(t => t.pnl).toFixed(2), avgPnl: done.length ? +(sum(t => t.pnl) / done.length).toFixed(3) : null,
      fees: +sum(t => t.entryFee + (t.exitFee || 0)).toFixed(2), avgSlippage: done.length ? +(sum(t => t.slippage) / done.length).toFixed(4) : null,
      avgFill: done.length ? +(sum(t => t.fillAvg) / done.length).toFixed(4) : null, curve: curve.slice(-200),
      exits: done.reduce((a, t) => (a[t.exit] = (a[t.exit] || 0) + 1, a), {}), recent: all.slice(-10).reverse() };
  }
  return out;
}
function liveScoreboard() {
  // the purest out-of-sample test: predictions logged live, before the outcome, scored after
  const scored = invs.filter(r => r.engines);
  const ids = [...new Set(scored.flatMap(r => Object.keys(r.engines)))].concat(['ensemble']);
  const rows = ids.map(id => {
    const xs = scored.map(r => ({ p: id === 'ensemble' ? r.pEns : r.engines[id], y: r.outcome === 'up' ? 1 : 0 })).filter(x => x.p != null);
    const b = xs.reduce((a, x) => a + (x.p - x.y) ** 2, 0) / (xs.length || 1);
    return { id, n: xs.length, brier: xs.length ? b : null, hit: xs.length ? xs.filter(x => (x.p >= 0.5) === (x.y === 1)).length / xs.length : null };
  });
  const mk = rows.find(r => r.id === 'mkt');
  for (const r of rows) r.skill = mk && mk.brier && r.brier != null ? 1 - r.brier / mk.brier : null;
  return rows.sort((a, b) => (a.brier ?? 9) - (b.brier ?? 9));
}
function writeSummaries() {
  fs.writeFileSync(path.join(DATA_DIR, 'perf.json'), JSON.stringify(perfSummary()));
  const sum = E.summarizeInvestigations(invs);
  fs.writeFileSync(path.join(DATA_DIR, 'inv.json'), JSON.stringify({ updated: new Date().toISOString(), ...sum, live: liveScoreboard(),
    byRegime: E.REGIMES.map(r => { const xs = invs.filter(x => x.regime === r); return { regime: r, n: xs.length, wrong: xs.filter(x => x.wrong).length }; }).filter(x => x.n) }));
  if (model) fs.writeFileSync(path.join(DATA_DIR, 'report.json'), JSON.stringify({ version: model.version, trained: model.trained, validated: model.validated, verdict: model.verdict, samples: model.samples, windows: model.windows, walkForward: model.walkForward }));
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
      (days[day] ||= []).push({ key: w.key, dur: w.dur, T: w.T, slug: w.slug, open: r2(w.open), outcome: w.outcome, rows: w.rows, v: 2 });
      log('saved', w.slug, w.outcome, w.rows.length, 'rows');
      appendLog({ ts: new Date().toISOString(), slug: w.slug, outcome: w.outcome, src: 'polymarket' });
      const saved = days[day][days[day].length - 1];
      for (const pr of w.preds || []) { const rep = E.investigate(pr, saved); rep.engines = pr.engines; rep.regime = pr.regime; rep.model = pr.model; invs.push(rep); appendFile('investigations', rep); }
      settleTrades(w.slug, w.outcome);
    }
  }
}

function save() {
  try { writeSummaries(); } catch (e) { log('summary failed', e.message); }
  const keep = Object.keys(days).sort().slice(-KEEP_DAYS);
  for (const d of Object.keys(days)) if (!keep.includes(d)) { delete days[d]; try { fs.unlinkSync(path.join(DATA_DIR, d + '.json')); } catch {} }
  for (const d of keep) fs.writeFileSync(path.join(DATA_DIR, d + '.json'), JSON.stringify(days[d]));
  let logs = []; try { logs = fs.readdirSync(path.join(DATA_DIR, 'predlog')).sort(); } catch {}
  const index = { updated: new Date().toISOString(), days: keep.map(d => ({ day: d, windows: days[d].length })), predlog: logs, model: model ? model.version : null };
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

connectCL(); connectCB(); connectKraken(); connectDeribit(); connectHL();
let lastTrain = 0;
const started = Date.now();
let lastSave = Date.now();
while (Date.now() - started < RUN_SECONDS * 1000) {
  const t0 = Date.now();
  try { await tick(); } catch (e) { log('tick error', e.message); }
  if (Math.floor(t0 / 20000) !== Math.floor((t0 - 2000) / 20000)) resolvePending().catch(() => {});
  if (Math.floor(t0 / 120000) !== Math.floor((t0 - 2000) / 120000)) settleOrphans().catch(() => {});
  if (Date.now() - lastSave > SAVE_EVERY * 1000) {
    lastSave = Date.now();
    if (Date.now() - lastTrain > TRAIN_EVERY * 1000) { lastTrain = Date.now(); try { train(); } catch (e) { log('train failed', e.message); } }
    save();
  }
  await new Promise(r => setTimeout(r, Math.max(100, 2000 - (Date.now() - t0))));
}
// finish up: wait for results of what's pending (up to 3 min), then save
for (let i = 0; i < 9 && pending.length; i++) { await resolvePending(); await new Promise(r => setTimeout(r, 20000)); }
try { train(); } catch (e) { log('train failed', e.message); }
save();
process.exit(0);
