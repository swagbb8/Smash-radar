/* BTC Radar engine v2 — runs identically on the phone (window.RadarEngine), in the
 * GitHub recorder/trainer (Node require), and in the backtest.
 *
 * Pipeline for one Polymarket window (BTC Up/Down 5m or 15m):
 *   feeds -> 7 independent engines (each: P(Up), evidence)
 *         -> anomaly detector (can block trading)
 *         -> ensemble (logistic regression over the engines' log-odds; weights are
 *            learned walk-forward from recorded outcomes, starting from a conservative
 *            50/50 blend of the statistical engine and the market price)
 *         -> setup rules (edge after fees, liquidity, spread, timing, agreement)
 *
 * Nothing here claims certainty. Every probability is an estimate whose track record is
 * measured out-of-sample by the trainer before its weights are trusted.
 */
(function (root) {
  const E = {};
  E.VERSION = 'engine-2.1';

  // ---------- config ----------
  E.FEE_RATE = 0.07;   // Polymarket crypto taker fee: shares × 0.07 × p × (1 − p), in USDC
  E.DEFAULTS = {
    stake: 10,
    mode: 'standard',
    minEdge: 0.08, minEv: 0.10, maxSpread: 0.04,
    minLeft: 20, maxLeft: { 300: 240, 900: 600 },
    minImbalance: -0.35, needMomentum: true,
    maxDisagree: 0.18,        // std-dev of engine probabilities above this = engines disagree
    tpShare: 0.8, riskReward: 1,
    lsMaxAsk: 0.10, lsMinRatio: 1.8, lsMinP: 0.03, lsMinLeft: 10, lsMaxLeft: { 300: 180, 900: 360 },
  };
  E.ENGINES = [
    { id: 'stat', name: 'Statistical', desc: 'Projects the closing 60s Chainlink average from price vs open, time left and volatility' },
    { id: 'mom', name: 'Momentum', desc: 'Same projection, extended by the last 30s trend' },
    { id: 'lead', name: 'Cross-exchange lead', desc: 'Coinbase + Kraken median vs Chainlink: where the settlement price is about to go' },
    { id: 'book', name: 'Order book', desc: 'Market price tilted by Polymarket and Kraken book pressure' },
    { id: 'vol', name: 'Volatility', desc: 'Statistical projection using the larger of fast/slow volatility (cautious in spikes)' },
    { id: 'deriv', name: 'Derivatives', desc: 'Perpetual futures premium (Deribit, Hyperliquid) as a short-term tilt · experimental' },
    { id: 'mkt', name: 'Market price', desc: 'What Polymarket traders are pricing right now (the benchmark to beat)' },
  ];
  // Default ensemble: bias + weights on each engine's log-odds, in E.ENGINES order.
  E.DEFAULT_MODEL = { version: 'default-1', trained: null, validated: false,
    bias: 0, w: [0.5, 0, 0, 0, 0, 0, 0.5], note: 'Untrained: 50/50 blend of Statistical and Market price' };
  let MODEL = E.DEFAULT_MODEL;
  E.setModel = (m) => { if (m && Array.isArray(m.w) && m.w.length === E.ENGINES.length) MODEL = m; };
  E.getModel = () => MODEL;

  // ---------- math ----------
  function erf(x) { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x);
    return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)); }
  E.Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const r2 = (v) => Math.round(v * 100) / 100;
  E.logit = (p) => { p = clamp(p, 0.0025, 0.9975); return Math.log(p / (1 - p)); };
  E.sigm = (x) => 1 / (1 + Math.exp(-x));
  E.fee = (shares, p) => shares * E.FEE_RATE * p * (1 - p);
  const median = (a) => { const s = a.slice().sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };

  function lastAt(cl, now) { for (let i = cl.length - 1; i >= 0; i--) if (cl[i].t <= now) return cl[i]; return null; }
  E.sigma = function (cl, now, maxN) {
    let sum = 0, n = 0; maxN = maxN || 240;
    for (let i = cl.length - 1; i > 0 && n < maxN; i--) {
      if (cl[i].t > now) continue;
      const dt = (cl[i].t - cl[i - 1].t) / 1000;
      if (dt > 0 && dt <= 3) { const r = (cl[i].v - cl[i - 1].v) / Math.sqrt(dt); sum += r * r; n++; }
    }
    return n > 10 ? Math.sqrt(sum / n) : 8;
  };
  E.momentum = function (cl, now, secs) { const a = lastAt(cl, now), b = lastAt(cl, now - secs * 1000); return a && b ? a.v - b.v : 0; };

  // composite lead: median of fresh exchange prices vs Chainlink, minus their usual gap (basis)
  E.compositeLead = function (ctx, lastV) {
    const now = ctx.now, xs = [];
    if (ctx.ex) for (const k in ctx.ex) { const e = ctx.ex[k]; if (e && e.v != null && now - e.t < 5000) xs.push(e.v); }
    if (!xs.length && ctx.cb != null && now - (ctx.cbT || 0) < 5000) xs.push(ctx.cb);
    const comp = median(xs);
    if (comp == null || ctx.exBasis == null) return { lead: 0, comp, n: xs.length, spread: 0 };
    return { lead: comp - lastV - ctx.exBasis, comp, n: xs.length, spread: xs.length > 1 ? Math.max(...xs) - Math.min(...xs) : 0 };
  };

  // core projection: closing 60s Chainlink average vs the open, with an assumed level for the rest
  function project(m, ctx, levelShift, sigOverride) {
    const { cl, now } = ctx;
    const last = lastAt(cl, now); if (!last) return null;
    const level = last.v + (levelShift || 0);
    const end = (m.T + m.dur) * 1000, left = Math.max(0, (end - now) / 1000);
    let ks = 0, kn = 0;
    for (let i = cl.length - 1; i >= 0; i--) { const p = cl[i]; if (p.t > now) continue; if (p.t < end - 60000) break; ks += p.v; kn++; }
    const unknownSec = Math.min(60, left), knownSec = 60 - unknownSec;
    const knownAvg = kn ? ks / kn : level;
    const proj = (knownAvg * knownSec + level * unknownSec) / 60;
    const sig = sigOverride || E.sigma(cl, now);
    const varr = left >= 60 ? sig * sig * ((left - 60) + 20) : sig * sig * Math.pow(left, 3) / 10800;
    const sd = Math.sqrt(Math.max(varr, 1e-6));
    const pUp = left === 0 ? (proj >= m.open ? 1 : 0) : E.Phi((proj - m.open) / sd);
    return { pUp, proj, left, last, sig, sd };
  }

  // kept for v1 callers: statistical projection + composite lead
  E.model = function (m, ctx) {
    if (m.open == null || !m.openExact) return null;
    const last = lastAt(ctx.cl, ctx.now); if (!last) return null;
    const cl = E.compositeLead(ctx, last.v);
    const r = project(m, ctx, cl.lead); if (!r) return null;
    r.lead = cl.lead; return r;
  };

  // order book summary from Polymarket /book JSON
  // stake (optional): also price a real fill of that many dollars by walking the asks
  E.readBook = function (b, stake) {
    const asks = (b.asks || []).map(x => ({ p: +x.price, s: +x.size })).sort((a, z) => a.p - z.p);
    const bids = (b.bids || []).map(x => ({ p: +x.price, s: +x.size })).sort((a, z) => z.p - a.p);
    const ask = asks.length ? asks[0].p : null, bid = bids.length ? bids[0].p : null;
    let room = 0, askDepth = 0, bidDepth = 0;
    for (const a of asks) { if (ask != null && a.p <= ask + 0.0201) room += a.p * a.s; if (ask != null && a.p <= ask + 0.0501) askDepth += a.s; }
    for (const x of bids) { if (bid != null && x.p >= bid - 0.0501) bidDepth += x.s; }
    const out = { ask, bid, room, askDepth, bidDepth };
    if (stake && asks.length) { const f = E.vwapBuy(b.asks, stake); out.fillAvg = f && f.complete ? f.avg : null; out.fillComplete = !!(f && f.complete); }
    return out;
  };
  const imb = (bk) => { if (!bk) return 0; const b = bk.bidDepth || 0, a = bk.askDepth || 0; return b + a > 0 ? (b - a) / (b + a) : 0; };
  const midOf = (bk) => bk && bk.ask != null && bk.bid != null ? (bk.ask + bk.bid) / 2 : (bk && bk.ask != null ? bk.ask : (bk && bk.bid != null ? bk.bid : null));

  // ---------- the 7 engines ----------
  E.runEngines = function (m, ctx) {
    if (m.open == null || !m.openExact) return null;
    const last = lastAt(ctx.cl, ctx.now); if (!last) return null;
    const sig = E.sigma(ctx.cl, ctx.now);
    const sigFast = E.sigma(ctx.cl, ctx.now, 30), sigSlow = E.sigma(ctx.cl, ctx.now, 600);
    const lead = E.compositeLead(ctx, last.v);
    const mom30 = E.momentum(ctx.cl, ctx.now, 30), mom10 = E.momentum(ctx.cl, ctx.now, 10);
    const left = Math.max(0, ((m.T + m.dur) * 1000 - ctx.now) / 1000);
    const out = {};
    const stat = project(m, ctx, 0, sig);
    out.stat = { p: stat.pUp, ev: 'gap ' + sgn(last.v - m.open) + ', projected close ' + sgn(stat.proj - m.open) + ', σ $' + sig.toFixed(1) + '/s' };
    const drift = clamp(mom30 / 30 * Math.min(left, 30) * 0.5, -3 * sig * Math.sqrt(30), 3 * sig * Math.sqrt(30));
    out.mom = { p: project(m, ctx, drift, sig).pUp, ev: '30s ' + sgn(mom30) + ', 10s ' + sgn(mom10) };
    out.lead = { p: project(m, ctx, lead.lead, sig).pUp, ev: lead.n ? lead.n + ' exch, lead ' + sgn(lead.lead) : 'no exchange data' };
    const upB = m.book && m.book.up, dnB = m.book && m.book.dn;
    const mid = midOf(upB) != null ? midOf(upB) : (midOf(dnB) != null ? 1 - midOf(dnB) : null);
    const bookTilt = (imb(upB) - imb(dnB)) / 2 + 0.5 * (ctx.krImb || 0);
    out.book = mid != null ? { p: E.sigm(E.logit(mid) + 1.0 * bookTilt), ev: 'PM book ' + pctS((imb(upB) - imb(dnB)) / 2) + ', Kraken ' + pctS(ctx.krImb || 0) } : { p: null, ev: 'no book' };
    const vs = project(m, ctx, 0, Math.max(sigFast, sigSlow));
    out.vol = { p: vs.pUp, ev: 'fast $' + sigFast.toFixed(1) + ' / slow $' + sigSlow.toFixed(1) + ' (' + (sigFast / Math.max(sigSlow, 0.01)).toFixed(1) + 'x)' };
    const prem = avgDefined([ctx.perp && ctx.perp.drbPrem, ctx.perp && ctx.perp.hlPrem]);
    out.deriv = prem != null ? { p: project(m, ctx, last.v * prem * 0.5, sig).pUp, ev: 'perp premium ' + (prem * 100).toFixed(3) + '%' } : { p: null, ev: 'no perp data' };
    out.mkt = mid != null ? { p: mid, ev: 'Up mid ' + Math.round(mid * 100) + '¢' } : { p: null, ev: 'no market' };

    // ensemble: logistic over engine log-odds (missing engine -> falls back to the market/stat).
    // If a validated regime-specific model exists for the current regime, it is used instead.
    const fallback = out.mkt.p != null ? out.mkt.p : out.stat.p;
    const x = E.ENGINES.map(e => E.logit(out[e.id].p != null ? out[e.id].p : fallback));
    const regime = E.regime(ctx);
    const rm = MODEL.regimes && MODEL.regimes[regime.key];
    const use = rm && rm.validated ? rm : MODEL;
    const pEns = E.predict(use, x);
    const ps = E.ENGINES.map(e => out[e.id].p).filter(p => p != null);
    const mean = ps.reduce((a, b) => a + b, 0) / ps.length;
    const disagree = Math.sqrt(ps.reduce((a, p) => a + (p - mean) ** 2, 0) / ps.length);
    const anomalies = E.anomalies(m, ctx, { sig, sigFast, sigSlow, lead, last });
    // as-of snapshot: exactly what the prediction could see, with the age of every input
    const asof = { t: ctx.now, clT: last.t, clV: last.v, open: m.open, left,
      exAge: ctx.ex ? Object.fromEntries(Object.entries(ctx.ex).map(([k, e]) => [k, ctx.now - e.t])) : {},
      bookAge: ctx.bookT ? ctx.now - ctx.bookT : null, upAsk: upB && upB.ask, upBid: upB && upB.bid, dnAsk: dnB && dnB.ask, dnBid: dnB && dnB.bid };
    return { engines: out, x, pUp: pEns, disagree, anomalies, left, sig, sigFast, sigSlow, lead: lead.lead, comp: lead.comp, last, proj: stat.proj,
      model: use === MODEL ? MODEL.version : MODEL.version + '/' + regime.key, regime, asof };
  };
  function sgn(v) { return (v >= 0 ? '+$' : '−$') + Math.abs(v).toFixed(2); }
  function pctS(v) { return (v >= 0 ? '+' : '') + Math.round(v * 100) + '%'; }
  function avgDefined(a) { const b = a.filter(v => v != null && isFinite(v)); return b.length ? b.reduce((x, y) => x + y, 0) / b.length : null; }

  // ---------- market regime ----------
  // Volatility state: fast (last ~30 obs) vs slow (last ~600 obs) volatility.
  // Trend state: 2-minute move measured in units of expected noise.
  // Uses only data at or before ctx.now.
  E.regime = function (ctx) {
    const fast = E.sigma(ctx.cl, ctx.now, 30), slow = E.sigma(ctx.cl, ctx.now, 600);
    const ratio = fast / Math.max(slow, 0.01);
    const vol = ratio > 1.8 ? 'spike' : ratio < 0.55 ? 'calm' : 'normal';
    const z = Math.abs(E.momentum(ctx.cl, ctx.now, 120)) / Math.max(slow * Math.sqrt(120), 0.01);
    const trend = z > 1.5 ? 'trending' : 'ranging';
    return { key: vol + '/' + trend, vol, trend, ratio, z };
  };
  E.REGIMES = ['calm/ranging', 'calm/trending', 'normal/ranging', 'normal/trending', 'spike/ranging', 'spike/trending'];

  // ---------- anomaly detector ----------
  // block = no setups while it's active; warn = shown, doesn't block
  E.anomalies = function (m, ctx, s) {
    const a = [], now = ctx.now;
    if (now - s.last.t > 4000) a.push({ level: 'block', msg: 'Chainlink feed stale ' + ((now - s.last.t) / 1000).toFixed(0) + 's' });
    if (!s.lead.n) a.push({ level: 'warn', msg: 'No exchange prices' });
    const bkT = ctx.bookT || 0; if (bkT && now - bkT > 4000) a.push({ level: 'block', msg: 'Order book stale' });
    const j = Math.abs(E.momentum(ctx.cl, now, 2));
    if (j > 5 * s.sig * Math.sqrt(2) && j > 15) a.push({ level: 'block', msg: 'Price jump $' + j.toFixed(0) + ' in 2s' });
    if (s.sigFast / Math.max(s.sigSlow, 0.01) > 3) a.push({ level: 'warn', msg: 'Volatility spike ' + (s.sigFast / s.sigSlow).toFixed(1) + 'x' });
    if (s.lead.spread > Math.max(25, s.last.v * 0.0005)) a.push({ level: 'block', msg: 'Exchanges disagree by $' + s.lead.spread.toFixed(0) });
    const up = m.book && m.book.up;
    if (up && up.ask != null && up.bid != null && up.ask - up.bid > 0.08) a.push({ level: 'warn', msg: 'Wide spread ' + Math.round((up.ask - up.bid) * 100) + '¢' });
    return a;
  };

  // ---------- exits ----------
  E.levels = function (ask, p, cfg) {
    const tp = clamp(r2(ask + (p - ask) * cfg.tpShare), r2(ask + 0.01), 0.99);
    const sl = clamp(r2(ask - (tp - ask) * cfg.riskReward), 0.01, r2(ask - 0.01));
    return { tp, sl };
  };

  // ---------- setup rules on top of the ensemble ----------
  E.evaluate = function (m, ctx, cfgIn) {
    const cfg = Object.assign({}, E.DEFAULTS, cfgIn || {});
    const run = E.runEngines(m, ctx);
    const out = { run, model: run ? { pUp: run.pUp, proj: run.proj, lead: run.lead, left: run.left, last: run.last } : null, cands: [], best: null };
    const left = Math.max(0, ((m.T + m.dur) * 1000 - ctx.now) / 1000);
    const mom = E.momentum(ctx.cl, ctx.now, 15);
    const blocks = run ? run.anomalies.filter(a => a.level === 'block') : [];
    for (const side of ['up', 'dn']) {
      const bk = m.book && m.book[side];
      const c = { market: m.key, slug: m.slug, side, left, fails: [], mode: cfg.mode };
      out.cands.push(c);
      if (!run) { c.fails.push('price to beat not locked'); continue; }
      if (!bk || bk.ask == null) { c.fails.push('no ask'); continue; }
      // price the trade at what $stake would actually pay (walking the book) when the book depth is known
      const p = side === 'up' ? run.pUp : 1 - run.pUp, dir = side === 'up' ? 1 : -1, ask = bk.fillAvg != null ? bk.fillAvg : bk.ask;
      const sh = cfg.stake / ask, entryFee = E.fee(sh, ask);
      Object.assign(c, { p, ask, bestAsk: bk.ask, slip: ask - bk.ask, bid: bk.bid, shares: sh, entryFee, room: bk.room || 0,
        spread: bk.bid != null ? ask - bk.bid : 1, imbalance: imb(bk), momentum: mom * dir, lead: run.lead * dir, disagree: run.disagree });
      c.edge = p - ask;
      c.ev = p / ask - 1 - entryFee / cfg.stake;           // per $1, after the entry fee, holding to settlement
      c.evHold = cfg.stake * c.ev;
      for (const b of blocks) c.fails.push(b.msg);
      if (bk.fillComplete === false) c.fails.push('book too thin to fill $' + cfg.stake);
      if (run.disagree > cfg.maxDisagree) c.fails.push('engines disagree (' + Math.round(run.disagree * 100) + ' pts)');
      if (cfg.mode === 'longshot') {
        c.ratio = p / ask;
        c.tp = clamp(r2(Math.max(ask * 2, ask + 0.05)), r2(ask + 0.01), 0.99); c.sl = null;
        c.plTp = sh * (c.tp - ask) - entryFee - E.fee(sh, c.tp); c.plSl = -cfg.stake - entryFee; c.plWin = sh * (1 - ask) - entryFee;
        if (ask > cfg.lsMaxAsk + 1e-9) c.fails.push('not cheap (' + Math.round(ask * 100) + '¢)');
        if (p < cfg.lsMinP) c.fails.push('chance under ' + Math.round(cfg.lsMinP * 100) + '%');
        if (c.ratio < cfg.lsMinRatio) c.fails.push('odds only ' + c.ratio.toFixed(1) + 'x price');
        if (c.ev <= 0) c.fails.push('negative after fees');
        if (c.room < cfg.stake) c.fails.push('thin book');
        if (left < cfg.lsMinLeft) c.fails.push('too late');
        if (left > (cfg.lsMaxLeft[m.dur] || 180)) c.fails.push('too early');
        if (!(c.momentum > 0 || c.lead > 0)) c.fails.push('no move toward it');
        c.score = c.ratio * 10 + clamp(c.momentum, -10, 10) * 0.3 + clamp(c.lead, -10, 10) * 0.3;
      } else {
        const lv = E.levels(ask, p, cfg); c.tp = lv.tp; c.sl = lv.sl;
        c.plTp = sh * (c.tp - ask) - entryFee - E.fee(sh, c.tp);
        c.plSl = sh * (c.sl - ask) - entryFee - E.fee(sh, c.sl);
        if (c.edge < cfg.minEdge) c.fails.push('edge ' + Math.round(c.edge * 100) + ' pts < ' + Math.round(cfg.minEdge * 100));
        if (c.ev < cfg.minEv) c.fails.push('EV after fees ' + Math.round(c.ev * 100) + '% < ' + Math.round(cfg.minEv * 100) + '%');
        if (c.spread > cfg.maxSpread + 1e-9) c.fails.push('spread ' + Math.round(c.spread * 100) + '¢');
        if (c.room < cfg.stake) c.fails.push('thin book');
        if (left < cfg.minLeft) c.fails.push('too late');
        if (left > (cfg.maxLeft[m.dur] || 240)) c.fails.push('too early');
        if (c.imbalance < cfg.minImbalance) c.fails.push('book against');
        if (cfg.needMomentum && (c.momentum < -2 || c.lead < -2)) c.fails.push('momentum against');
        c.score = c.edge * 100 + 4 * c.imbalance + clamp(c.momentum, -10, 10) * 0.3 + clamp(c.lead, -10, 10) * 0.3;
      }
      c.qualified = c.fails.length === 0;
    }
    out.best = out.cands.filter(c => c.qualified).sort((a, b) => b.score - a.score)[0] || null;
    return out;
  };

  // ---------- trade simulation (fees included) ----------
  E.simulate = function (entry, path, outcome) {
    for (const s of path) {
      if (s.bid == null) continue;
      if (s.bid >= entry.tp) return { exit: 'take profit', px: entry.tp, t: s.t, exitFee: true };
      if (entry.sl != null && s.bid <= entry.sl) return { exit: 'stop', px: s.bid, t: s.t, exitFee: true };
    }
    if (!outcome) return null;
    const won = (outcome === 'up') === (entry.side === 'up');
    return { exit: won ? 'settled win' : 'settled loss', px: won ? 1 : 0, t: null, exitFee: false };
  };
  E.pnl = function (entry, res, stake) {
    if (!res) return null;
    const sh = stake / entry.ask;
    return sh * (res.px - entry.ask) - E.fee(sh, entry.ask) - (res.exitFee ? E.fee(sh, res.px) : 0);
  };
  E.holdPnl = (entry, outcome, stake) => {
    if (!outcome) return null; const sh = stake / entry.ask;
    return sh * (((outcome === 'up') === (entry.side === 'up') ? 1 : 0) - entry.ask) - E.fee(sh, entry.ask);
  };

  // ---------- replay recorded windows ----------
  // row: [sec, cl, cb, upAsk, upBid, dnAsk, dnBid, upRoom, dnRoom, upBidD, upAskD, dnBidD, dnAskD,
  //       kr, krImb, drbPrem, drbFund, hlPrem, hlFund]   (columns 13+ exist from recorder v2 on)
  E.replay = function (w, onRow) {
    const cl = [], m = { key: w.key, slug: w.slug, dur: w.dur, T: w.T, open: w.open, openExact: true, book: {} };
    let exBasis = null;
    for (const r of w.rows) {
      const t = (w.T + r[0]) * 1000;
      if (r[1] != null) cl.push({ t, v: r[1] });
      const ex = {}; if (r[2] != null) ex.cb = { v: r[2], t }; if (r[13] != null) ex.kr = { v: r[13], t };
      const xs = Object.values(ex).map(e => e.v);
      if (xs.length && r[1] != null) { const d = median(xs) - r[1]; exBasis = exBasis == null ? d : exBasis + (d - exBasis) * 0.05; }
      m.book.up = { ask: r[3], bid: r[4], room: r[7], bidDepth: r[9], askDepth: r[10] };
      m.book.dn = { ask: r[5], bid: r[6], room: r[8], bidDepth: r[11], askDepth: r[12] };
      const ctx = { now: t, cl, ex, exBasis, krImb: r[14] != null ? r[14] : 0, bookT: t,
        perp: { drbPrem: r[15], drbFund: r[16], hlPrem: r[17], hlFund: r[18] } };
      onRow(m, ctx, r, t);
    }
  };

  // training samples: engine log-odds every ~10s inside the window, labeled with the real outcome
  E.samples = function (windows, everySec) {
    everySec = everySec || 10;
    const out = [];
    for (const w of windows) {
      if (!w.outcome || w.open == null || !w.rows || w.rows.length < 20) continue;
      let nextAt = 15;
      E.replay(w, (m, ctx, r) => {
        const left = w.dur - r[0];
        if (r[0] < nextAt || left < 5) return;
        nextAt = r[0] + everySec;
        const run = E.runEngines(m, ctx); if (!run || run.engines.mkt.p == null) return;
        out.push({ T: w.T, key: w.key, slug: w.slug, t: ctx.now, left, x: run.x, mkt: run.engines.mkt.p, regime: run.regime.key, y: w.outcome === 'up' ? 1 : 0 });
      });
    }
    return out;
  };

  // L2-regularized logistic regression (batch gradient descent), starting from the default blend
  E.fitLogistic = function (S, opts) {
    opts = opts || {}; const lambda = opts.lambda != null ? opts.lambda : 0.02, iters = opts.iters || 400, lr = opts.lr || 0.05;
    const k = E.ENGINES.length; let b = 0, w = E.DEFAULT_MODEL.w.slice();
    if (!S.length) return { bias: b, w };
    for (let it = 0; it < iters; it++) {
      let gb = 0; const gw = new Array(k).fill(0);
      for (const s of S) { let z = b; for (let i = 0; i < k; i++) z += w[i] * s.x[i]; const e = E.sigm(z) - s.y; gb += e; for (let i = 0; i < k; i++) gw[i] += e * s.x[i]; }
      b -= lr * gb / S.length;
      for (let i = 0; i < k; i++) w[i] -= lr * (gw[i] / S.length + lambda * (w[i] - E.DEFAULT_MODEL.w[i]));
    }
    return { bias: b, w };
  };
  E.predict = (mdl, x) => { let z = mdl.bias; for (let i = 0; i < x.length; i++) z += mdl.w[i] * x[i]; return E.sigm(z); };
  const brier = (p, y) => (p - y) ** 2;

  const logloss = (p, y) => { p = clamp(p, 1e-4, 1 - 1e-4); return -(y * Math.log(p) + (1 - y) * Math.log(1 - p)); };

  // Fit a model per regime (only where the training data has enough windows), else global.
  E.fitAdaptive = function (train, minWin) {
    minWin = minWin || 40;
    const g = E.fitLogistic(train); g.regimes = {};
    for (const r of E.REGIMES) {
      const sub = train.filter(s => s.regime === r);
      if (new Set(sub.map(s => s.T)).size >= minWin) { const f = E.fitLogistic(sub); g.regimes[r] = { bias: f.bias, w: f.w, validated: true, n: sub.length }; }
    }
    return g;
  };
  const predAdaptive = (mdl, s) => { const r = mdl.regimes && mdl.regimes[s.regime]; return E.predict(r && r.validated ? r : mdl, s.x); };

  // Walk-forward evaluation (the "tournament"): expanding window, train strictly on windows that
  // closed before the test fold starts, then score every engine, the market, the default blend,
  // the global ensemble and the regime-adaptive ensemble on the unseen fold.
  E.walkForward = function (S, folds) {
    folds = folds || 5;
    const Ts = [...new Set(S.map(s => s.T))].sort((a, b) => a - b);
    const names = E.ENGINES.map(e => e.id).concat(['default', 'ensemble', 'adaptive']);
    const res = { enough: false, windows: Ts.length };
    if (Ts.length < 30) return res;
    const start = Math.floor(Ts.length * 0.4), size = Math.ceil((Ts.length - start) / folds);
    const rows = [];   // per test sample: predictions of every competitor
    for (let f = 0; f < folds; f++) {
      const lo = Ts[start + f * size]; if (lo == null) break;
      const hi = Ts[Math.min(Ts.length - 1, start + (f + 1) * size - 1)];
      const maxDur = 900;   // a training window must have CLOSED before the fold starts: no overlap/leakage
      const train = S.filter(s => s.T + (s.key === '15m' ? 900 : 300) <= lo), test = S.filter(s => s.T >= lo && s.T <= hi);
      if (!train.length || !test.length) continue;
      const g = E.fitLogistic(train), ad = E.fitAdaptive(train);
      for (const s of test) {
        const pr = {}; E.ENGINES.forEach((e, i) => { pr[e.id] = E.sigm(s.x[i]); });
        pr.mkt = s.mkt; pr.default = E.predict(E.DEFAULT_MODEL, s.x); pr.ensemble = E.predict(g, s.x); pr.adaptive = predAdaptive(ad, s);
        rows.push({ T: s.T, regime: s.regime, y: s.y, pr });
      }
    }
    if (!rows.length) return res;
    const score = (rs) => {
      const o = {};
      for (const n of names) { let b = 0, l = 0, hit = 0; for (const r of rs) { b += brier(r.pr[n], r.y); l += logloss(r.pr[n], r.y); hit += (r.pr[n] >= 0.5) === (r.y === 1) ? 1 : 0; } o[n] = { brier: b / rs.length, logloss: l / rs.length, hit: hit / rs.length }; }
      for (const n of names) o[n].skill = 1 - o[n].brier / o.mkt.brier;   // >0 = better than the market
      return o;
    };
    res.overall = score(rows);
    res.tournament = names.filter(n => n !== 'mkt').map(n => ({ id: n, ...res.overall[n] })).sort((a, b) => a.brier - b.brier);
    res.tournament.unshift({ id: 'mkt', ...res.overall.mkt, benchmark: true });
    res.byRegime = {};
    for (const r of E.REGIMES) { const rs = rows.filter(x => x.regime === r); if (rs.length >= 20) res.byRegime[r] = Object.assign(score(rs), { n: rs.length, windows: new Set(rs.map(x => x.T)).size }); }
    // significance: per-window mean Brier difference (best ensemble vs market), bootstrap over windows
    const best = res.overall.adaptive.brier < res.overall.ensemble.brier ? 'adaptive' : 'ensemble';
    const byWin = {}; for (const r of rows) { (byWin[r.T] ||= []).push(brier(r.pr[best], r.y) - brier(r.pr.mkt, r.y)); }
    const d = Object.values(byWin).map(a => a.reduce((x, y) => x + y, 0) / a.length);
    const mean = d.reduce((a, b) => a + b, 0) / d.length;
    const sd = Math.sqrt(d.reduce((a, x) => a + (x - mean) ** 2, 0) / Math.max(1, d.length - 1));
    let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const boots = []; for (let b = 0; b < 1000; b++) { let s2 = 0; for (let i = 0; i < d.length; i++) s2 += d[Math.floor(rnd() * d.length)]; boots.push(s2 / d.length); }
    boots.sort((a, b) => a - b);
    res.test = { competitor: best, testWindows: d.length, samples: rows.length, meanDiff: mean, z: sd > 0 ? -mean / (sd / Math.sqrt(d.length)) : 0, ci90: [boots[50], boots[949]] };
    // calibration (reliability) for the best ensemble and the market
    res.calibration = ['mkt', best].map(n => ({ id: n, bins: Array.from({ length: 10 }, (_, i) => { const rs = rows.filter(r => Math.min(9, Math.floor(r.pr[n] * 10)) === i); return { lo: i / 10, n: rs.length, pred: rs.length ? rs.reduce((a, r) => a + r.pr[n], 0) / rs.length : null, actual: rs.length ? rs.reduce((a, r) => a + r.y, 0) / rs.length : null }; }) }));
    res.enough = true; res.testSamples = rows.length;
    return res;
  };

  // Full training run -> versioned model + proof report.
  // "Validated" only if the best ensemble beats the market out-of-sample with the whole 90%
  // bootstrap interval below zero and at least 100 test windows.
  E.train = function (windows, prevVersion) {
    const S = E.samples(windows, 20);
    const wf = E.walkForward(S);
    const ad = E.fitAdaptive(S);
    const t = wf.test;
    const validated = !!(wf.enough && t.testWindows >= 100 && t.ci90[1] < 0);
    const n = prevVersion && /^v(\d+)/.test(prevVersion) ? +prevVersion.match(/^v(\d+)/)[1] + 1 : 1;
    const useAdaptive = validated && t.competitor === 'adaptive';
    return { version: 'v' + n, engine: E.VERSION, trained: new Date().toISOString(), validated,
      bias: ad.bias, w: ad.w, regimes: useAdaptive ? ad.regimes : {}, samples: S.length, walkForward: wf,
      verdict: !wf.enough ? 'Not enough data yet (' + wf.windows + ' windows, need 30+ to start testing, 100+ test windows to prove anything)'
        : validated ? 'Beats the market out-of-sample: ' + t.competitor + ' ensemble, ' + t.testWindows + ' test windows, 90% CI of Brier difference entirely below zero'
        : 'Not proven: out-of-sample it ' + (t.meanDiff < 0 ? 'edges the market but the evidence is not strong enough yet' : 'does not beat the market') + ' (' + t.testWindows + ' test windows)' };
  };

  // ---------- failure investigation ----------
  // pred: a logged as-of prediction ({pEns, engines:{id:p}, regime, lead, open, cl, t, left}).
  // w: the recorded window with outcome. Looks only at what happened AFTER the prediction to explain it.
  E.investigate = function (pred, w) {
    const y = w.outcome === 'up' ? 1 : 0;
    const favored = pred.pEns >= 0.5 ? 1 : 0;
    const wrong = favored !== y;
    const rep = { slug: w.slug, t: pred.t, left: pred.left, pEns: pred.pEns, outcome: w.outcome, wrong, brier: (pred.pEns - y) ** 2, causes: [], right: [], wrongEngines: [] };
    for (const [k, p] of Object.entries(pred.engines || {})) { if (p == null) continue; ((p >= 0.5 ? 1 : 0) === y ? rep.right : rep.wrongEngines).push(k); }
    const bestEng = Object.entries(pred.engines || {}).filter(([, p]) => p != null).sort((a, b) => (a[1] - y) ** 2 - (b[1] - y) ** 2)[0];
    rep.bestEngine = bestEng ? { id: bestEng[0], p: bestEng[1], brier: (bestEng[1] - y) ** 2 } : null;
    if (!wrong) return rep;
    // what happened after the prediction
    const tPred = (pred.t - w.T * 1000) / 1000;
    const after = w.rows.filter(r => r[0] > tPred && r[1] != null);
    const atPred = w.rows.filter(r => r[0] <= tPred && r[1] != null).pop();
    if (atPred && after.length) {
      const gap0 = atPred[1] - w.open;
      let lastCross = null; for (let i = 1; i < after.length; i++) if (Math.sign(after[i][1] - w.open) !== Math.sign(after[i - 1][1] - w.open)) lastCross = after[i][0];
      const moveAfter = after[after.length - 1][1] - atPred[1];
      rep.gapAtPrediction = +gap0.toFixed(2); rep.moveAfter = +moveAfter.toFixed(2);
      if (lastCross != null && w.dur - lastCross <= 30) rep.causes.push('late reversal: price crossed the open with ' + Math.round(w.dur - lastCross) + 's left');
      // regime at prediction vs at the end
      let regEnd = null, regAt = pred.regime || null;
      E.replay(w, (m, ctx, r) => { if (r === w.rows[w.rows.length - 1]) regEnd = E.regime(ctx).key; });
      rep.regimeAt = regAt; rep.regimeEnd = regEnd;
      if (regAt && regEnd && regAt !== regEnd) rep.causes.push('regime changed: ' + regAt + ' → ' + regEnd);
      if (regEnd && regEnd.startsWith('spike')) rep.causes.push('volatility spike after the prediction');
      // did the exchange lead materialize?
      if (pred.lead != null && Math.abs(pred.lead) > 2) {
        const next = after.find(r => r[0] >= tPred + 30);
        if (next && Math.sign(next[1] - atPred[1]) !== Math.sign(pred.lead)) rep.causes.push('exchange lead faded: lead ' + (pred.lead > 0 ? '+' : '') + pred.lead.toFixed(1) + ' but price went the other way');
      }
      if (Math.abs(moveAfter) > Math.abs(gap0) * 2 && Math.abs(moveAfter) > 20) rep.causes.push('large move after the prediction ($' + Math.abs(moveAfter).toFixed(0) + ')');
    }
    const mkt = pred.engines && pred.engines.mkt;
    if (mkt != null && (mkt >= 0.5 ? 1 : 0) === y) rep.causes.push('market had it right; the model overrode it');
    if (!rep.right.length) rep.causes.push('every engine and the market were wrong (likely unpredictable from this data)');
    if (!rep.causes.length) rep.causes.push('no single cause found: a normal miss within the stated uncertainty');
    rep.betterAlternative = rep.right.length ? rep.right : null;
    return rep;
  };
  E.summarizeInvestigations = function (reps) {
    const wrong = reps.filter(r => r.wrong);
    const causes = {}, engWrong = {}, engRight = {};
    for (const r of wrong) for (const c of r.causes) { const k = c.split(':')[0].split(' (')[0]; causes[k] = (causes[k] || 0) + 1; }
    for (const r of reps) { r.right.forEach(e => engRight[e] = (engRight[e] || 0) + 1); r.wrongEngines.forEach(e => engWrong[e] = (engWrong[e] || 0) + 1); }
    const engines = Object.keys({ ...engWrong, ...engRight }).map(e => ({ id: e, hit: (engRight[e] || 0) / ((engRight[e] || 0) + (engWrong[e] || 0)), n: (engRight[e] || 0) + (engWrong[e] || 0) })).sort((a, b) => b.hit - a.hit);
    return { predictions: reps.length, wrong: wrong.length, causes: Object.entries(causes).sort((a, b) => b[1] - a[1]), engines, latest: wrong.slice(-8).reverse() };
  };

  // ---------- executable fills (Polymarket performance) ----------
  // Walk the ask side to fill `dollars`; returns average price, shares and slippage vs best ask.
  E.vwapBuy = function (asks, dollars) {
    const lv = asks.map(x => ({ p: +x.price, s: +x.size })).sort((a, b) => a.p - b.p);
    let spent = 0, sh = 0;
    for (const l of lv) { const can = l.p * l.s, take = Math.min(can, dollars - spent); sh += take / l.p; spent += take; if (spent >= dollars - 1e-9) break; }
    if (!sh) return null;
    return { avg: spent / sh, shares: sh, spent, best: lv[0].p, slippage: spent / sh - lv[0].p, complete: spent >= dollars - 1e-6 };
  };
  E.vwapSell = function (bids, shares) {
    const lv = bids.map(x => ({ p: +x.price, s: +x.size })).sort((a, b) => b.p - a.p);
    let got = 0, sold = 0;
    for (const l of lv) { const take = Math.min(l.s, shares - sold); got += take * l.p; sold += take; if (sold >= shares - 1e-9) break; }
    if (!sold) return null;
    return { avg: got / sold, proceeds: got, sold, best: lv[0].p, slippage: lv[0].p - got / sold, complete: sold >= shares - 1e-6 };
  };

  // ---------- backtest (setups + calibration) ----------
  E.backtest = function (windows, cfgIn) {
    const cfg = Object.assign({}, E.DEFAULTS, cfgIn || {});
    const trades = [], calib = [];
    for (const w of windows) {
      if (!w.outcome || w.open == null || !w.rows || w.rows.length < 10) continue;
      let entry = null; const path = []; const cpDone = {};
      E.replay(w, (m, ctx, r, t) => {
        const left = w.dur - r[0];
        for (const cp of [120, 60, 30]) {
          if (!cpDone[cp] && left <= cp && left > cp - 6) {
            cpDone[cp] = 1;
            const run = E.runEngines(m, ctx);
            if (run && run.engines.mkt.p != null) calib.push({ key: w.key, cp, model: run.pUp, market: run.engines.mkt.p, y: w.outcome === 'up' ? 1 : 0 });
          }
        }
        if (!entry) {
          const ev = E.evaluate(m, ctx, cfg);
          if (ev.best) { const b = ev.best; entry = { slug: w.slug, key: w.key, T: w.T, side: b.side, ask: b.ask, p: b.p, edge: b.edge, tp: b.tp, sl: b.sl, left: b.left, mode: cfg.mode }; }
        } else path.push({ t, bid: entry.side === 'up' ? r[4] : r[6] });
      });
      if (entry) {
        const res = E.simulate(entry, path, w.outcome);
        trades.push(Object.assign(entry, { outcome: w.outcome, exit: res && res.exit, exitPx: res && res.px, pnl: E.pnl(entry, res, cfg.stake), hold: E.holdPnl(entry, w.outcome, cfg.stake) }));
      }
    }
    return { trades, calib, stats: E.stats(trades, cfg.stake), calibStats: E.calibStats(calib) };
  };
  E.stats = function (trades, stake) {
    const done = trades.filter(t => t.pnl != null);
    const wins = done.filter(t => t.pnl > 0).length;
    const total = done.reduce((a, t) => a + t.pnl, 0);
    const holdDone = done.filter(t => t.hold != null);
    return { n: done.length, wins, losses: done.length - wins, winRate: done.length ? wins / done.length : null,
      total, avg: done.length ? total / done.length : null, avgPct: done.length ? total / done.length / stake : null,
      holdTotal: holdDone.reduce((a, t) => a + t.hold, 0) };
  };
  E.calibStats = function (calib) {
    if (!calib.length) return { n: 0 };
    let bm = 0, bk = 0; for (const c of calib) { bm += (c.model - c.y) ** 2; bk += (c.market - c.y) ** 2; }
    return { n: calib.length, model: bm / calib.length, market: bk / calib.length };
  };

  // ---------- BTC forecasts across horizons ----------
  // series: [{t, v}] 1-second composite exchange price. Returns per-horizon estimates.
  E.HORIZONS = [10, 30, 60, 120, 300, 900, 1800, 3600];
  E.horizons = function (series, now) {
    const n = series.length; if (n < 30) return null;
    const last = series[n - 1];
    // EWMA variance of 1s returns (half-life ~2 min) and short drift (60s), shrunk toward zero
    let v = null, prev = null;
    for (const p of series) { if (prev && p.t - prev.t <= 3000) { const r = (p.v - prev.v) / Math.sqrt((p.t - prev.t) / 1000); v = v == null ? r * r : v + (r * r - v) * 0.006; } prev = p; }
    const sig1 = Math.sqrt(v || 64);
    const a60 = lastAt(series, now - 60000), a300 = lastAt(series, now - 300000);
    const mu60 = a60 ? (last.v - a60.v) / ((last.t - a60.t) / 1000 || 1) : 0;
    const mu300 = a300 ? (last.v - a300.v) / ((last.t - a300.t) / 1000 || 1) : 0;
    return E.HORIZONS.map(h => {
      const sh = sig1 * Math.sqrt(h);
      const mu = h <= 120 ? mu60 * 0.25 : mu300 * 0.03;    // trends mostly fade: heavy shrink
      const cap = h <= 120 ? 0.35 : 0.2;                    // never let a trend claim more than this many σ
      const d = clamp(mu * h, -cap * sh, cap * sh);
      const pUp = E.Phi(d / sh);
      const band = Math.max(1, Math.round(0.3 * sh));
      const pRange = E.Phi((band - d) / sh) - E.Phi((-band - d) / sh);
      return { h, pUp, pDown: 1 - pUp, band, pRange, expMove: sh * Math.sqrt(2 / Math.PI), lo: last.v + d - 1.28 * sh, hi: last.v + d + 1.28 * sh, sigma: sh,
        actionable: Math.abs(pUp - 0.5) >= 0.08 };
    });
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = E; else root.RadarEngine = E;
})(typeof window !== 'undefined' ? window : globalThis);
