/* BTC Radar signal engine.
 * One set of rules used three ways: live on the page, in paper trading, and in the backtest
 * over recorded windows. Works in the browser (window.RadarEngine) and in Node (require).
 *
 * A "setup" is a side (Up or Down) of one market where ALL rules pass:
 *   - the exact price to beat is known
 *   - estimated win chance beats the price you'd pay by at least minEdge
 *   - expected return on the stake is at least minEv
 *   - spread is tight and there is enough size near the ask for the stake
 *   - short-term momentum and Coinbase's lead are not pointing against the side
 *   - order book on that side is not heavily stacked against it
 *   - time left is inside the window where the rules are allowed to fire
 * Setups are ranked by score (edge, plus small credit for book imbalance and momentum).
 */
(function (root) {
  const E = {};

  E.DEFAULTS = {
    stake: 10,
    minEdge: 0.08,      // win chance minus entry price (8 points)
    minEv: 0.10,        // expected return per $1 staked (10%)
    maxSpread: 0.04,    // ask - bid on that side
    minLeft: 20,        // seconds left: don't fire in the last 20s
    maxLeft: { 300: 240, 900: 600 },  // don't fire too early either
    minImbalance: -0.35,
    needMomentum: true,
    tpShare: 0.8,       // take profit at 80% of the way from entry to estimated fair price
    riskReward: 1,      // stop distance = take-profit distance * riskReward
    mode: 'standard',   // 'standard' | 'longshot'
    // Longshot mode: cheap sides (≤ lsMaxAsk) the model rates well above their price,
    // with the price moving toward them. No stop: the most you can lose is the stake.
    lsMaxAsk: 0.10,
    lsMinRatio: 1.8,    // model win chance must be at least 1.8x the price
    lsMinP: 0.03,
    lsMinLeft: 10,
    lsMaxLeft: { 300: 180, 900: 360 },
  };

  // ---- math ----
  function erf(x) { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x);
    return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)); }
  E.Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const r2 = (v) => Math.round(v * 100) / 100;

  // per-second volatility from recent Chainlink points [{t(ms), v}]
  E.sigma = function (cl, now) {
    let sum = 0, n = 0;
    for (let i = cl.length - 1; i > 0 && n < 240; i--) {
      if (cl[i].t > now) continue;
      const dt = (cl[i].t - cl[i - 1].t) / 1000;
      if (dt > 0 && dt <= 3) { const r = (cl[i].v - cl[i - 1].v) / Math.sqrt(dt); sum += r * r; n++; }
    }
    return n > 10 ? Math.sqrt(sum / n) : 8;
  };

  function lastAt(cl, now) { for (let i = cl.length - 1; i >= 0; i--) if (cl[i].t <= now) return cl[i]; return null; }
  E.momentum = function (cl, now, secs) {
    const a = lastAt(cl, now), b = lastAt(cl, now - secs * 1000);
    return a && b ? a.v - b.v : 0;
  };

  // win-chance model: projects the closing 60s Chainlink average and its spread
  E.model = function (m, ctx) {
    const { cl, now } = ctx;
    if (m.open == null || !m.openExact) return null;
    const last = lastAt(cl, now); if (!last) return null;
    const lead = (ctx.cb != null && ctx.basis != null && now - ctx.cbT < 5000) ? (ctx.cb - last.v) - ctx.basis : 0;
    const level = last.v + lead;
    const end = (m.T + m.dur) * 1000, left = Math.max(0, (end - now) / 1000);
    let ks = 0, kn = 0;
    for (let i = cl.length - 1; i >= 0; i--) { const p = cl[i]; if (p.t > now) continue; if (p.t < end - 60000) break; ks += p.v; kn++; }
    const unknownSec = Math.min(60, left), knownSec = 60 - unknownSec;
    const knownAvg = kn ? ks / kn : level;
    const proj = (knownAvg * knownSec + level * unknownSec) / 60;
    const sig = E.sigma(cl, now);
    const varr = left >= 60 ? sig * sig * ((left - 60) + 20) : sig * sig * Math.pow(left, 3) / 10800;
    const sd = Math.sqrt(Math.max(varr, 1e-6));
    const pUp = left === 0 ? (proj >= m.open ? 1 : 0) : E.Phi((proj - m.open) / sd);
    return { pUp, proj, lead, left, last, sig };
  };

  // order book summary from Polymarket /book JSON
  E.readBook = function (b) {
    const asks = (b.asks || []).map(x => ({ p: +x.price, s: +x.size })).sort((a, z) => a.p - z.p);
    const bids = (b.bids || []).map(x => ({ p: +x.price, s: +x.size })).sort((a, z) => z.p - a.p);
    const ask = asks.length ? asks[0].p : null, bid = bids.length ? bids[0].p : null;
    let room = 0, askDepth = 0, bidDepth = 0;
    for (const a of asks) { if (ask != null && a.p <= ask + 0.0201) room += a.p * a.s; if (ask != null && a.p <= ask + 0.0501) askDepth += a.s; }
    for (const x of bids) { if (bid != null && x.p >= bid - 0.0501) bidDepth += x.s; }
    return { ask, bid, room, askDepth, bidDepth };
  };

  // exit levels from entry and estimated fair price
  E.levels = function (ask, p, cfg) {
    const tp = clamp(r2(ask + (p - ask) * cfg.tpShare), r2(ask + 0.01), 0.99);
    const sl = clamp(r2(ask - (tp - ask) * cfg.riskReward), 0.01, r2(ask - 0.01));
    return { tp, sl };
  };

  // evaluate both sides of one market; returns candidates with pass/fail reasons
  E.evaluate = function (m, ctx, cfgIn) {
    const cfg = Object.assign({}, E.DEFAULTS, cfgIn || {});
    const mo = E.model(m, ctx);
    const out = { model: mo, cands: [], best: null };
    const left = Math.max(0, ((m.T + m.dur) * 1000 - ctx.now) / 1000);
    const mom = E.momentum(ctx.cl, ctx.now, 15);
    for (const side of ['up', 'dn']) {
      const bk = m.book && m.book[side];
      const c = { market: m.key, slug: m.slug, side, left, fails: [] };
      out.cands.push(c);
      if (!mo) { c.fails.push('price to beat not locked'); continue; }
      if (!bk || bk.ask == null) { c.fails.push('no ask'); continue; }
      const p = side === 'up' ? mo.pUp : 1 - mo.pUp;
      const dir = side === 'up' ? 1 : -1;
      c.p = p; c.ask = bk.ask; c.bid = bk.bid;
      c.edge = p - bk.ask;
      c.ev = p / bk.ask - 1;
      c.spread = bk.bid != null ? bk.ask - bk.bid : 1;
      c.room = bk.room || 0;
      const bd = bk.bidDepth || 0, ad = bk.askDepth || 0;
      c.imbalance = bd + ad > 0 ? (bd - ad) / (bd + ad) : 0;
      c.momentum = mom * dir;          // + means moving toward this side
      c.lead = mo.lead * dir;
      const sh = cfg.stake / bk.ask; c.shares = sh; c.evHold = cfg.stake * c.ev; c.mode = cfg.mode;
      if (cfg.mode === 'longshot') {
        c.ratio = p / bk.ask;
        c.tp = clamp(r2(Math.max(bk.ask * 2, bk.ask + 0.05)), r2(bk.ask + 0.01), 0.99); c.sl = null;
        c.plTp = sh * (c.tp - bk.ask); c.plSl = -cfg.stake; c.plWin = sh * (1 - bk.ask);
        if (bk.ask > cfg.lsMaxAsk + 1e-9) c.fails.push('not cheap (' + Math.round(bk.ask * 100) + '¢)');
        if (p < cfg.lsMinP) c.fails.push('chance under ' + Math.round(cfg.lsMinP * 100) + '%');
        if (c.ratio < cfg.lsMinRatio) c.fails.push('odds only ' + c.ratio.toFixed(1) + 'x price');
        if (c.room < cfg.stake) c.fails.push('thin book');
        if (left < cfg.lsMinLeft) c.fails.push('too late');
        if (left > (cfg.lsMaxLeft[m.dur] || 180)) c.fails.push('too early');
        if (!(c.momentum > 0 || c.lead > 0)) c.fails.push('no move toward it');
        c.score = c.ratio * 10 + clamp(c.momentum, -10, 10) * 0.3 + clamp(c.lead, -10, 10) * 0.3;
        c.qualified = c.fails.length === 0;
        continue;
      }
      const lv = E.levels(bk.ask, p, cfg); c.tp = lv.tp; c.sl = lv.sl;
      c.plTp = sh * (c.tp - bk.ask); c.plSl = sh * (c.sl - bk.ask);
      if (c.edge < cfg.minEdge) c.fails.push('edge ' + Math.round(c.edge * 100) + ' pts < ' + Math.round(cfg.minEdge * 100));
      if (c.ev < cfg.minEv) c.fails.push('EV ' + Math.round(c.ev * 100) + '% < ' + Math.round(cfg.minEv * 100) + '%');
      if (c.spread > cfg.maxSpread + 1e-9) c.fails.push('spread ' + Math.round(c.spread * 100) + '¢');
      if (c.room < cfg.stake) c.fails.push('thin book');
      if (left < cfg.minLeft) c.fails.push('too late');
      if (left > (cfg.maxLeft[m.dur] || 240)) c.fails.push('too early');
      if (c.imbalance < cfg.minImbalance) c.fails.push('book against');
      if (cfg.needMomentum && (c.momentum < -2 || c.lead < -2)) c.fails.push('momentum against');
      c.score = c.edge * 100 + 4 * c.imbalance + clamp(c.momentum, -10, 10) * 0.3 + clamp(c.lead, -10, 10) * 0.3;
      c.qualified = c.fails.length === 0;
    }
    const q = out.cands.filter(c => c.qualified).sort((a, b) => b.score - a.score);
    out.best = q[0] || null;
    return out;
  };

  // ---- trade simulation (paper + backtest) ----
  // path: [{t, bid}] for the traded side after entry; outcome: 'up' | 'down' | null
  E.simulate = function (entry, path, outcome) {
    for (const s of path) {
      if (s.bid == null) continue;
      if (s.bid >= entry.tp) return { exit: 'take profit', px: entry.tp, t: s.t };
      if (entry.sl != null && s.bid <= entry.sl) return { exit: 'stop', px: s.bid, t: s.t };
    }
    if (!outcome) return null;
    const won = (outcome === 'up') === (entry.side === 'up');
    return { exit: won ? 'settled win' : 'settled loss', px: won ? 1 : 0, t: null };
  };
  E.pnl = (entry, res, stake) => res ? stake / entry.ask * (res.px - entry.ask) : null;
  E.holdPnl = (entry, outcome, stake) => outcome ? stake / entry.ask * (((outcome === 'up') === (entry.side === 'up') ? 1 : 0) - entry.ask) : null;

  // ---- backtest over recorded windows ----
  // window: {key, dur, T, open, outcome, rows: [[sec, cl, cb, upAsk, upBid, dnAsk, dnBid, upRoom, dnRoom, upBidD, upAskD, dnBidD, dnAskD]]}
  E.backtest = function (windows, cfgIn) {
    const cfg = Object.assign({}, E.DEFAULTS, cfgIn || {});
    const trades = [], calib = [];
    for (const w of windows) {
      if (!w.outcome || w.open == null || !w.rows || w.rows.length < 10) continue;
      const cl = [], m = { key: w.key, slug: w.slug, dur: w.dur, T: w.T, open: w.open, openExact: true, book: {} };
      let basis = null, entry = null, path = [], checkpointDone = {};
      for (const r of w.rows) {
        const t = (w.T + r[0]) * 1000;
        if (r[1] != null) cl.push({ t, v: r[1] });
        if (r[2] != null && r[1] != null) { const d = r[2] - r[1]; basis = basis == null ? d : basis + (d - basis) * 0.05; }
        m.book.up = { ask: r[3], bid: r[4], room: r[7], bidDepth: r[9], askDepth: r[10] };
        m.book.dn = { ask: r[5], bid: r[6], room: r[8], bidDepth: r[11], askDepth: r[12] };
        const ctx = { now: t, cl, cb: r[2], cbT: t, basis };
        // calibration at fixed checkpoints: model vs market, against the real outcome
        const left = w.dur - r[0];
        for (const cp of [120, 60, 30]) {
          if (!checkpointDone[cp] && left <= cp && left > cp - 6) {
            checkpointDone[cp] = 1;
            const mo = E.model(m, ctx);
            const mid = r[3] != null && r[4] != null ? (r[3] + r[4]) / 2 : null;
            if (mo && mid != null) calib.push({ key: w.key, cp, model: mo.pUp, market: mid, y: w.outcome === 'up' ? 1 : 0 });
          }
        }
        if (!entry) {
          const ev = E.evaluate(m, ctx, cfg);
          if (ev.best) {
            const b = ev.best;
            entry = { slug: w.slug, key: w.key, T: w.T, side: b.side, ask: b.ask, p: b.p, edge: b.edge, tp: b.tp, sl: b.sl, left: b.left };
          }
        } else {
          path.push({ t, bid: entry.side === 'up' ? r[4] : r[6] });
        }
      }
      if (entry) {
        const res = E.simulate(entry, path, w.outcome);
        trades.push(Object.assign(entry, { outcome: w.outcome, exit: res && res.exit, exitPx: res && res.px,
          pnl: E.pnl(entry, res, cfg.stake), hold: E.holdPnl(entry, w.outcome, cfg.stake) }));
      }
    }
    return { trades, calib, stats: E.stats(trades, cfg.stake), calibStats: E.calibStats(calib) };
  };

  E.stats = function (trades, stake) {
    const done = trades.filter(t => t.pnl != null);
    const wins = done.filter(t => t.pnl > 0).length;
    const total = done.reduce((a, t) => a + t.pnl, 0);
    const holdDone = done.filter(t => t.hold != null);
    const holdTotal = holdDone.reduce((a, t) => a + t.hold, 0);
    return { n: done.length, wins, losses: done.length - wins, winRate: done.length ? wins / done.length : null,
      total, avg: done.length ? total / done.length : null, avgPct: done.length ? total / done.length / stake : null,
      holdTotal, holdWinRate: holdDone.length ? holdDone.filter(t => t.hold > 0).length / holdDone.length : null };
  };
  // Brier score: lower is better. If the model doesn't beat the market, its "edge" is noise.
  E.calibStats = function (calib) {
    if (!calib.length) return { n: 0 };
    let bm = 0, bk = 0; for (const c of calib) { bm += (c.model - c.y) ** 2; bk += (c.market - c.y) ** 2; }
    return { n: calib.length, model: bm / calib.length, market: bk / calib.length };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = E; else root.RadarEngine = E;
})(typeof window !== 'undefined' ? window : globalThis);
