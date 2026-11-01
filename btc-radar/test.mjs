// Test suite for the BTC Radar engine. Run: node btc-radar/test.mjs [recorded-day.json ...]
// Proves the pieces behave as claimed: no future-data leakage, correct fee and fill math,
// and a walk-forward test that detects a real edge when one exists and does NOT invent one
// when outcomes are random.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const E = createRequire(import.meta.url)('../pages-extra/btc5m/engine.js');

let pass = 0, fail = 0;
const ok = (cond, name, detail) => { if (cond) { pass++; console.log('PASS', name, detail || ''); } else { fail++; console.log('FAIL', name, detail || ''); } };
const near = (a, b, eps) => Math.abs(a - b) <= (eps || 1e-9);

// ---------- 1. fees (Polymarket docs example: 100 shares at $0.50 -> $1.75) ----------
ok(near(E.fee(100, 0.5), 1.75, 1e-9), 'fee formula matches Polymarket docs', '$' + E.fee(100, 0.5).toFixed(4));
ok(near(E.fee(10 / 0.02, 0.02), 10 * 0.07 * 0.98, 1e-9), 'fee on $10 at 2¢ = $0.686', '$' + E.fee(500, 0.02).toFixed(4));

// ---------- 2. executable fills ----------
const asks = [{ price: '0.52', size: '5' }, { price: '0.53', size: '10' }, { price: '0.55', size: '100' }];
const f = E.vwapBuy(asks, 10);
ok(f && near(f.spent, 10, 1e-9) && f.avg > 0.52 && f.avg < 0.55 && near(f.best, 0.52), 'VWAP buy walks the book', `avg ${f.avg.toFixed(4)}, slippage ${(f.slippage * 100).toFixed(2)}¢, shares ${f.shares.toFixed(2)}`);
const s = E.vwapSell([{ price: '0.60', size: '3' }, { price: '0.58', size: '50' }], 10);
ok(s && near(s.sold, 10) && near(s.proceeds, 3 * 0.6 + 7 * 0.58), 'VWAP sell walks the bids', `avg ${s.avg.toFixed(4)}`);
ok(E.vwapBuy([{ price: '0.5', size: '4' }], 10).complete === false, 'partial fill is flagged when the book is too thin');

// ---------- synthetic windows ----------
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
// marketKind: 'lagged'    market reacts 20s late + noise          -> a real, exploitable edge
//             'efficient' market prices current info correctly    -> no edge: model should NOT beat it
//             'random'    coin-flip outcomes, market sits near 50% -> no edge exists
function synth(n, marketKind) {
  const W = []; let T = 1790000000; let price = 78000;
  for (let k = 0; k < n; k++, T += 300) {
    const rows = [], path = [];
    for (let sec = 0; sec <= 300; sec += 2) { price += gauss() * 1.4 * Math.sqrt(2); path.push(price); }
    const open = path[0];
    const twap = path.slice(-30).reduce((a, b) => a + b, 0) / 30;
    const outcome = marketKind === 'random' ? (rnd() < 0.5 ? 'up' : 'down') : (twap >= open ? 'up' : 'down');
    for (let i = 0; i < path.length; i++) {
      const sec = i * 2, left = 300 - sec;
      const lagI = marketKind === 'lagged' ? Math.max(0, i - 10) : i;   // lagged market sees the price 20s late
      const known = path.slice(Math.max(0, path.length - 30), i + 1);     // efficient market: true TWAP math
      const gap = path[lagI] - open;
      let mid;
      if (marketKind === 'random') mid = 0.5 + gauss() * 0.02;
      else if (marketKind === 'efficient') {
        // the best possible pricing: the same TWAP projection, with the TRUE volatility (1.4/√s), no lag
        const end = path.length - 1, kStart = end - 29;
        const kn = Math.max(0, i - kStart + 1), un = 30 - kn;
        const kAvg = kn ? path.slice(kStart, i + 1).reduce((a, b) => a + b, 0) / kn : path[i];
        const proj = (kAvg * kn + path[i] * un) / 30;
        const sig = 1.4, l = left;
        const varr = l >= 60 ? sig * sig * ((l - 60) + 20) : sig * sig * Math.pow(l, 3) / 10800;
        mid = E.Phi((proj - open) / Math.sqrt(Math.max(varr, 1e-6))) + gauss() * 0.005;
      } else mid = E.Phi(gap / (1.4 * Math.sqrt(Math.max(left + 20, 20) + 20))) + gauss() * 0.04;
      mid = Math.min(0.97, Math.max(0.03, mid));
      const up = Math.round(mid * 100) / 100;
      rows.push([sec, +path[i].toFixed(2), +(path[i] - 20).toFixed(2), Math.min(0.99, up + 0.01), Math.max(0.01, up - 0.01),
        Math.min(0.99, 1 - up + 0.01), Math.max(0.01, 1 - up - 0.01), 500, 500, 1000, 1000, 1000, 1000]);
    }
    W.push({ key: '5m', dur: 300, T, slug: 'synthetic-' + T, open, outcome, rows });
  }
  return W;
}

// ---------- 3. no future-data leakage ----------
{
  const w = synth(1, 'lagged')[0];
  const fullCl = w.rows.map(r => ({ t: (w.T + r[0]) * 1000, v: r[1] }));
  let checked = 0, identical = 0;
  E.replay(w, (m, ctx, r) => {
    if (r[0] % 40 !== 0 || r[0] < 20) return;
    const a = E.runEngines(m, ctx);                                  // only data up to now
    const b = E.runEngines(m, Object.assign({}, ctx, { cl: fullCl })); // the whole window, future included
    checked++; if (a && b && a.x.every((v, i) => near(v, b.x[i], 1e-12)) && near(a.pUp, b.pUp, 1e-12) && a.regime.key === b.regime.key) identical++;
  });
  ok(checked > 3 && identical === checked, 'predictions ignore future data', `${identical}/${checked} identical with the full future present`);
}

// ---------- 4. walk-forward detects a real edge ----------
{
  const W = synth(220, 'lagged');
  const m = E.train(W, null);
  const t = m.walkForward.test;
  const top = m.walkForward.tournament.filter(x => !x.benchmark)[0];
  ok(m.walkForward.enough && t.ci90[1] < 0 && m.validated, 'real edge (market lags 20s) is detected and validated',
    `test windows ${t.testWindows}, Brier diff ${t.meanDiff.toFixed(4)}, 90% CI [${t.ci90[0].toFixed(4)}, ${t.ci90[1].toFixed(4)}], top engine ${top.id} skill ${(top.skill * 100).toFixed(1)}%`);
  ok(m.walkForward.overall.mkt.brier > m.walkForward.overall.stat.brier, 'statistical engine outranks the lagging market', `stat ${m.walkForward.overall.stat.brier.toFixed(4)} vs market ${m.walkForward.overall.mkt.brier.toFixed(4)}`);
}

// ---------- 5. walk-forward refuses to "prove" an edge that doesn't exist ----------
for (const kind of ['random', 'efficient']) {
  const W = synth(220, kind);
  const m = E.train(W, null);
  ok(m.walkForward.enough && !m.validated, 'no edge vs a ' + (kind === 'random' ? 'calibrated coin-flip' : 'efficient') + ' market is NOT validated',
    m.verdict + ' · Brier diff ' + m.walkForward.test.meanDiff.toFixed(4) + ' CI [' + m.walkForward.test.ci90.map(v => v.toFixed(4)).join(', ') + ']');
}

// ---------- 6. failure investigation explains misses ----------
{
  const W = synth(40, 'lagged');
  const reps = [];
  for (const w of W) {
    let pred = null;
    E.replay(w, (m, ctx, r) => { if (!pred && r[0] >= 180) { const run = E.runEngines(m, ctx); pred = { t: ctx.now, left: run.left, pEns: run.pUp, engines: Object.fromEntries(Object.entries(run.engines).map(([k, v]) => [k, v.p])), regime: run.regime.key, lead: run.lead }; } });
    reps.push(E.investigate(pred, w));
  }
  const sum = E.summarizeInvestigations(reps);
  ok(sum.predictions === 40 && sum.wrong >= 1 && sum.latest.every(r => r.causes.length > 0), 'every wrong prediction gets at least one cause',
    `${sum.wrong} wrong of ${sum.predictions}; top causes: ${sum.causes.slice(0, 3).map(c => c[0] + ' ×' + c[1]).join(', ')}`);
}

// ---------- 7. real recorded data (if given) ----------
const files = process.argv.slice(2);
if (files.length) {
  const seen = new Set();
  const W = files.flatMap(p => JSON.parse(fs.readFileSync(p, 'utf8'))).filter(w => !seen.has(w.slug) && seen.add(w.slug)).sort((a, b) => a.T - b.T);
  const m = E.train(W, null);
  console.log('\nREAL DATA:', W.length, 'windows,', m.samples, 'samples');
  console.log('  verdict:', m.verdict);
  if (m.walkForward.enough) {
    console.log('  tournament (out-of-sample Brier, lower is better; skill > 0 means better than the market):');
    for (const x of m.walkForward.tournament) console.log('   ', x.id.padEnd(9), x.brier.toFixed(4), 'skill', (x.skill * 100).toFixed(1) + '%', 'hit', (x.hit * 100).toFixed(0) + '%');
    console.log('  test:', JSON.stringify(m.walkForward.test));
  }
  let leakOk = 0, leakN = 0;
  for (const w of W.slice(-5)) {
    const full = w.rows.filter(r => r[1] != null).map(r => ({ t: (w.T + r[0]) * 1000, v: r[1] }));
    E.replay(w, (mm, ctx, r) => { if (r[0] % 60 > 2) return; const a = E.runEngines(mm, ctx), b = E.runEngines(mm, Object.assign({}, ctx, { cl: full })); if (a && b) { leakN++; if (near(a.pUp, b.pUp, 1e-12)) leakOk++; } });
  }
  ok(leakN > 0 && leakOk === leakN, 'no leakage on real recorded windows', `${leakOk}/${leakN}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
