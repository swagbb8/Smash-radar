// Play simulator: structured play -> 22 players with assignments, a physically-flying football, and a timeline of
// events (snap, throw, catch, tackle, touchdown...). Deterministic fixed-step, no DOM — also runs in Node for tests.
// Field: yards. x runs goal line (-50) to goal line (+50), end zones to +-60; y sideline to sideline (+-26.65); z up.
// The offense always attacks +x.

export const G = 10.72;                       // gravity, yards / s^2
const DT = 1 / 60;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (k) => k * k * (3 - 2 * k);
const hyp = Math.hypot;
const VMAX = { QB: 7.4, RB: 9.0, FB: 8.2, WR: 9.6, TE: 8.4, OL: 5.4, DL: 6.2, LB: 8.3, CB: 9.4, S: 9.2, K: 6.5, P: 6.5 };
const POS_GROUP = { LT: 'OL', LG: 'OL', C: 'OL', RG: 'OL', RT: 'OL', DE: 'DL', DT: 'DL', FS: 'S', SS: 'S', H: 'QB', KR: 'WR', PR: 'WR', G: 'WR', LS: 'OL' };
export const groupOf = (pos) => POS_GROUP[pos] || pos;
const O_NUMS = [12, 28, 72, 66, 61, 64, 77, 87, 11, 14, 17];
const D_NUMS = [94, 97, 92, 99, 54, 52, 58, 24, 21, 31, 33];

export function buildPlay(play, opts = {}) {
  const S = 1.0;                                            // snap time
  const sim = { play, S, players: [], O: [], D: [], ballSegs: [], events: [], t: 0, hero: null, heroTeam: 'O' };
  const f = play.flags || {};
  const T = play.type;
  const sgnOf = (dir) => (dir === 'left' ? 1 : dir === 'right' ? -1 : 0);

  // ---------- helpers
  const mk = (team, i, pos, x, y) => {
    const p = { team, i, id: (team === 'O' ? 0 : 11) + i, pos, grp: groupOf(pos), num: (team === 'O' ? O_NUMS : D_NUMS)[i], home: [x, y], segs: [], acts: [],
      x, y, z: 0, vx: 0, vy: 0, face: team === 'O' ? 0 : Math.PI, rest: team === 'O' ? 0 : Math.PI, speed: 0, missed: false };
    sim.players.push(p); sim[team][i] = p; return p;
  };
  const seg = (p, t0, kind, data = {}) => { p.segs.push({ t0, kind, ...data }); p.segs.sort((a, b) => a.t0 - b.t0); };
  const path = (p, keys, o = {}) => seg(p, keys[0][0], 'path', { keys, ...o });
  const hold = (p, t0, x, y, o = {}) => seg(p, t0, 'hold', { x, y, ...o });
  const act = (p, type, t0, t1, data = {}) => p.acts.push({ type, t0, t1, ...data });
  const ev = (t, type, data = {}) => sim.events.push({ t, type, ...data });
  const evalKeys = (keys, t) => {
    if (t <= keys[0][0]) return [keys[0][1], keys[0][2]];
    for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const a = keys[i - 1], b = keys[i], k = (t - a[0]) / Math.max(1e-6, b[0] - a[0]); return [lerp(a[1], b[1], k), lerp(a[2], b[2], k)]; }
    const l = keys[keys.length - 1]; return [l[1], l[2]];
  };
  const at = (p, t) => {                                    // scripted spot of a player (paths / holds only)
    let s = null; for (const q of p.segs) if (q.t0 <= t && (q.kind === 'path' || q.kind === 'hold')) s = q;
    if (!s) return [...p.home]; return s.kind === 'hold' ? [s.x, s.y] : evalKeys(s.keys, t);
  };
  const air = (t0, Tf, p0, p1) => { sim.ballSegs.push({ t0, t1: t0 + Tf, kind: 'air', p0, p1, v: [(p1[0] - p0[0]) / Tf, (p1[1] - p0[1]) / Tf, (p1[2] - p0[2] + 0.5 * G * Tf * Tf) / Tf] }); return t0 + Tf; };
  const held = (t0, by, o = {}) => sim.ballSegs.push({ t0, kind: 'held', by, ...o });
  const spot = (t0, pos) => sim.ballSegs.push({ t0, kind: 'dead', pos });
  const loose = (t0, p0, v0, dur) => {                      // fumble: bounce it now so we know where it ends up
    const pts = []; let p = [...p0], v = [...v0], n = 0;
    for (let t = 0; t <= dur + 1e-6; t += DT) { pts.push([...p]); v[2] -= G * DT; p = [p[0] + v[0] * DT, p[1] + v[1] * DT, p[2] + v[2] * DT];
      if (p[2] < 0.14) { p[2] = 0.14; v = [v[0] * 0.62 + (n % 2 ? 0.9 : -0.6), v[1] * 0.62 + (n % 2 ? -0.8 : 1.1), Math.abs(v[2]) * 0.48]; if (v[2] < 0.9) v = [v[0] * 0.5, v[1] * 0.5, 0]; n++; } }
    sim.ballSegs.push({ t0, t1: t0 + dur, kind: 'loose', pts }); return pts[pts.length - 1];
  };
  const runTo = (keys, to, speed) => { const l = keys[keys.length - 1]; const t = l[0] + hyp(to[0] - l[1], to[1] - l[2]) / speed; keys.push([t, to[0], to[1]]); return t; };
  const crossX = (keys, X, dirn = 1) => { for (let i = 1; i < keys.length; i++) { const a = keys[i - 1], b = keys[i]; if ((a[1] - X) * dirn < 0 && (b[1] - X) * dirn >= 0) return lerp(a[0], b[0], (X - a[1]) / (b[1] - a[1])); } return null; };
  const meet = (p, t0, tT, pt, o = {}) => seg(p, t0, 'meet', { pt, tT, ...o });
  const pursue = (p, t0, o = {}) => seg(p, t0, 'pursue', { off: [-(0.6 + (p.i % 3) * 0.9), ((p.i % 5) - 2) * 0.8], ...o });
  const stopAll = (team, t0) => { for (const p of sim[team]) seg(p, t0 + 0.15 + (p.i % 4) * 0.08, 'stop'); };
  const tackle = (carrier, tT, tackler, pt, o = {}) => {
    meet(tackler, o.from ?? Math.max(S, tT - 1.5), tT, [pt[0] - 0.5 * Math.cos(carrier.faceHint || 0), pt[1]], { hit: true });
    act(tackler, 'dive', tT - 0.2, tT + 0.4); act(tackler, 'down', tT + 0.4, 99);
    act(carrier, 'fall', tT, tT + 0.5, o); act(carrier, 'down', tT + 0.5, 99);
    ev(tT, 'tackle', { who: carrier, by: tackler, big: !!o.big, pos: pt });
  };
  const celebrate = (hero, team, t0, kind = 'td') => {
    sim.hero = hero; sim.heroTeam = team;
    act(hero, 'celebrate', t0 + 0.35, 99, { style: kind === 'td' ? (hero.num % 3) : 3 });
    sim[team].forEach((p, k) => { if (p !== hero) { seg(p, t0 + 0.5 + (k % 4) * 0.12, 'follow', { who: hero, r: 1.7 + (k % 3) * 0.8, a: k * 0.63 }); if (k % 3 === 0) act(p, 'celebrate', t0 + 2.0, 99, { style: 1 }); } });
    stopAll(team === 'O' ? 'D' : 'O', t0);
  };
  const jukes = (keys, from, to, speed, n) => {             // weave: cuts that make pursuers miss
    for (let k = 1; k <= n; k++) { const q = k / (n + 1); runTo(keys, [lerp(from[0], to[0], q), lerp(from[1], to[1], q) + (k % 2 ? 1 : -1) * 3.2], speed); }
    return runTo(keys, to, speed);
  };

  // ---------- field position
  const yards = play.yards;
  const toEZ = (dflt) => clamp(play.startYd ?? dflt, 1, 99);
  let L;                                                    // line of scrimmage (x)
  const scrimmage = (form, Lx) => {
    L = Lx; sim.L = L;
    const gun = form === 'gun', sq = Math.min(1, (59 - L) / 15);   // squeeze the defense near the goal line
    const o = form === 'fg'
      ? [['H', L - 7, 0.55], ['K', L - 10.2, -2.0], ['LT', L - 0.6, 2.4], ['LG', L - 0.6, 1.2], ['LS', L - 0.5, 0], ['RG', L - 0.6, -1.2], ['RT', L - 0.6, -2.4], ['TE', L - 0.7, 3.6], ['TE', L - 0.7, -3.6], ['TE', L - 1.4, 4.9], ['TE', L - 1.4, -4.9]]
      : [['QB', gun ? L - 5 : L - 1.15, 0], ['RB', gun ? L - 5 : L - 6.6, gun ? -1.9 : 0], ['LT', L - 0.75, 2.8], ['LG', L - 0.7, 1.4], ['C', L - 0.55, 0], ['RG', L - 0.7, -1.4], ['RT', L - 0.75, -2.8],
        ['TE', L - 0.8, -4.3], ['WR', L - 0.5, 18], ['WR', L - 1.3, -19], ['WR', L - 1.3, 9]];
    o.forEach(([pos, x, y], i) => mk('O', i, pos, x, y));
    const d = form === 'fg'
      ? [['DE', 0.8, 3.4], ['DT', 0.8, 1.1], ['DT', 0.8, -1.1], ['DE', 0.8, -3.4], ['LB', 0.9, 4.8], ['LB', 0.9, 2.2], ['LB', 0.9, -4.8], ['CB', 0.9, 6.2], ['CB', 0.9, -6.2], ['S', 5, 2], ['S', 5, -2]]
      : [['DE', 0.9, 3.9], ['DT', 0.9, 1.3], ['DT', 0.9, -1.3], ['DE', 0.9, -3.9], ['LB', 4.6, 5.2], ['LB', 4.6, 0], ['LB', 4.6, -5.2], ['CB', 6.5, 18], ['CB', 6.5, -19], ['FS', 14, -1.5], ['SS', 8.5, 9]];
    d.forEach(([pos, dx, y], i) => mk('D', i, pos, Math.min(59.2, L + (dx < 2 ? dx : dx * sq + 1.2 * (1 - sq))), y));
    for (const p of sim.players) { hold(p, 0, p.home[0], p.home[1]); if (['OL', 'DL'].includes(p.grp) || (form === 'fg' && p.pos !== 'K')) act(p, 'stance', 0, S + 0.05); else act(p, 'ready', 0, S); }
    spot(0, [L, 0, 0.16]); ev(S, 'snap');
  };
  const linePass = (tGo) => {
    for (let i = 2; i <= 6; i++) { const p = sim.O[i]; path(p, [[S, ...p.home], [S + 0.7, p.home[0] - 1.3, p.home[1] * 1.05]], { face: 0 }); act(p, 'block', S + 0.1, tGo + 0.3); }
    for (let i = 0; i < 4; i++) { const p = sim.D[i]; path(p, [[S, ...p.home], [S + 0.8, L - 0.3, p.home[1] * 0.95], [tGo, L - 2.7, p.home[1] * 0.75]]); act(p, 'block', S + 0.5, tGo); pursue(p, tGo + 0.1); }
  };
  const lineRun = (sg, tFree) => {
    for (let i = 2; i <= 6; i++) { const p = sim.O[i]; path(p, [[S, ...p.home], [S + 1.3, p.home[0] + 2.3, p.home[1] - sg * 0.7]], { face: 0 }); act(p, 'block', S + 0.1, tFree + 1.5); }
    for (let i = 0; i < 4; i++) { const p = sim.D[i]; path(p, [[S, ...p.home], [S + 1.1, L + 1.7, p.home[1] - sg * 0.6]]); act(p, 'block', S + 0.3, tFree); pursue(p, tFree, { slow: 0.75 }); }
  };

  // ---------- PASS (touchdowns, long/short, one-handed, jump ball, sideline, hail mary, screen, 2-pt, interceptions)
  const passPlay = () => {
    const isInt = T === 'interception' || T === 'pick_six', hail = T === 'hail_mary', screen = T === 'screen', two = T === 'two_point';
    const td = play.result === 'td' || (two && play.result === 'good');
    let start = two ? 2 : hail ? clamp(yards, 35, 60) : td ? yards : clamp(yards + 22, 28, 80);
    let airY = play.air ?? (hail ? yards + 5 : screen ? -1.5 : td ? (yards > 14 ? Math.max(yards * 0.72, yards - 14) : yards + 2.5) : yards * (yards > 15 ? 0.8 : 0.6));
    if (isInt) { const ret = T === 'pick_six' ? clamp(play.returnYards ?? yards, 10, 99) : null; airY = 14; start = ret != null ? clamp(100 - ret + airY, 20, 95) : toEZ(55); }
    scrimmage('gun', 50 - toEZ(start));
    const [qb, rb] = sim.O, sg = sgnOf(play.dir) || (screen ? 1 : 1);
    const tgt = screen ? rb : play.dir === 'middle' ? sim.O[10] : sg > 0 ? sim.O[8] : sim.O[9];
    const cover = screen ? sim.D[4] : tgt === sim.O[8] ? sim.D[7] : tgt === sim.O[9] ? sim.D[8] : sim.D[10];
    if (play.target != null) tgt.num = play.target; if (play.passer != null) qb.num = play.passer;
    if (isInt && play.defender != null) cover.num = play.defender;
    const y0 = tgt.home[1], side = Math.sign(y0) || sg;
    const route = play.route || (hail ? 'hail' : f.sideline ? 'out' : f.overShoulder ? 'go' : airY >= 22 ? 'post' : airY >= 10 ? 'dig' : 'slant');
    // catch point
    let cx = Math.min(58.4, L + airY), cy;
    if (route === 'go' || route === 'fade') cy = y0 * 0.93; else if (route === 'post') cy = y0 * 0.3; else if (route === 'corner') cy = side * 21.5;
    else if (route === 'out' || route === 'comeback') cy = side * 24.9; else if (route === 'hail') cy = side * 3; else if (route === 'slant' || route === 'crosser' || route === 'drag') cy = y0 * 0.25;
    else if (route === 'seam') cy = y0 * 0.55; else cy = y0 * 0.5;
    if (f.sideline) cy = side * 24.9;
    if (screen) { cx = L - 1.5; cy = sg * 9; }
    if (td && cx < 50 && L + yards >= 50 && airY >= yards) cx = Math.min(58, 50 + 3);
    const C = [cx, cy];
    // timing: the ball has to arrive when the receiver does
    const drop = hail ? 3.0 : f.scramble ? 2.9 : screen ? 1.55 : airY < 8 ? 1.0 : 1.55;
    const qThrow = f.scramble ? [L - 6.4, -side * 7.5] : [L - (screen ? 9.5 : 7.4), 0];
    const dist = hyp(C[0] - qThrow[0], C[1] - qThrow[1]);
    const Tf = screen ? 0.75 : clamp(0.42 + dist * (hail ? 0.05 : 0.04), 0.5, 3.2);
    const brk = screen ? [L - 3, sg * 5] : route === 'post' || route === 'corner' || route === 'dig' || route === 'out' || route === 'comeback' ? [L + Math.max(3, airY * 0.62), y0] : [lerp(tgt.home[0], C[0], 0.5), lerp(y0, C[1], route === 'go' || route === 'fade' ? 0.5 : 0.25)];
    const rl1 = hyp(brk[0] - tgt.home[0], brk[1] - y0), rl2 = hyp(C[0] - brk[0], C[1] - brk[1]), wrV = 8.9;
    let tCatch = Math.max(S + drop + Tf, S + 0.15 + (rl1 + rl2) / wrV), tThrow = tCatch - Tf;
    const tb = S + 0.15 + (tCatch - S - 0.15) * rl1 / (rl1 + rl2);
    // quarterback
    if (f.scramble) {
      path(qb, [[S, ...qb.home], [S + 0.9, L - 7.4, 0], [S + 1.5, L - 7.6, 0.3], [S + 2.0, L - 9, -side * 3], [tThrow - 0.25, ...qThrow]], { exact: true, face: 0 });
      const de = sim.D[side > 0 ? 0 : 3];                    // the rusher he escapes
      meet(de, S + 0.3, S + 1.75, [L - 7.4, side * 0.6]); act(de, 'dive', S + 1.6, S + 2.1); act(de, 'down', S + 2.1, S + 3.4); ev(S + 1.75, 'escape', { who: qb, by: de });
    } else path(qb, [[S, ...qb.home], [S + 0.25, ...qb.home], [Math.min(tThrow - 0.3, S + 1.1), ...qThrow]], { exact: true, face: 0 });
    act(qb, 'throw', tThrow - 0.45, tThrow + 0.3, { toward: C });
    // target receiver
    const short = isInt ? [C[0] - 1.1, C[1] - side * 0.9] : C;
    const keys = [[S, ...tgt.home], [S + 0.15, ...tgt.home], [tb, ...brk], [tCatch, ...short]];
    const jump = f.jumpBall || hail, zc = jump ? 2.75 : f.oneHand ? 2.45 : f.overShoulder ? 1.95 : screen ? 1.5 : 1.75;
    let tEvent, heroTeam = 'O', hero = tgt;
    if (!isInt) {
      act(tgt, f.oneHand ? 'catch1' : 'catch', tCatch - 0.32, tCatch + 0.18, { toward: [qThrow[0], qThrow[1]], over: f.overShoulder });
      if (jump) act(tgt, 'jump', tCatch - 0.36, tCatch + 0.3, { h: 1.05 });
      act(tgt, 'carry', tCatch + 0.18, 99);
      ev(tCatch, 'catch', { who: tgt, pos: [...C, zc], oneHand: f.oneHand, jump });
      const endX = L + yards;
      if (td) {
        const E = [Math.max(C[0], 50) + 4.5, clamp(C[1] * 0.92, -24, 24)];
        if (C[0] < 50) { if (f.juke || endX - C[0] > 18) jukes(keys, C, E, 9.2, f.juke ? 2 : 1); else runTo(keys, E, 9.2); } else runTo(keys, [Math.min(58.6, C[0] + 2.2), C[1] * 0.96], 5);
        tEvent = Math.max(tCatch, crossX(keys, 50) ?? tCatch);
        ev(tEvent, two ? 'two_pt' : 'td', { who: tgt, team: 'O' });
        celebrate(tgt, 'O', tEvent);
      } else if (two) { tEvent = tCatch + 0.2; ev(tEvent, 'two_pt_fail', { who: tgt }); }
      else if (f.sideline) {
        runTo(keys, [C[0] + 1.6, side * 27.6], 5); tEvent = keys[keys.length - 1][0]; ev(tEvent, 'oob', { who: tgt }); runTo(keys, [C[0] + 3, side * 29], 2.5); stopAll('D', tEvent); stopAll('O', tEvent + 0.2);
      } else {
        const E = [Math.min(49, Math.max(endX, C[0] + 1.5)), C[1] + (f.juke ? -side * 2 : 0)];
        const tT = f.juke ? jukes(keys, C, E, 9, 1) : runTo(keys, E, 9); tgt.faceHint = 0;
        tackle(tgt, tT, cover, E, { big: yards >= 25 }); tEvent = tT;
      }
      path(tgt, keys, { exact: true });
      if (!td && !f.sideline && !two) seg(tgt, tEvent + 0.05, 'stop');
    } else {
      // interception: the defender jumps the route
      path(tgt, keys, { exact: true }); act(tgt, 'catch', tCatch - 0.25, tCatch + 0.2, { toward: qThrow });
      hero = cover; heroTeam = 'D'; meet(cover, tThrow, tCatch, C, { exact: true });
      act(cover, 'catch', tCatch - 0.3, tCatch + 0.18, { toward: qThrow }); act(cover, 'jump', tCatch - 0.3, tCatch + 0.25, { h: 0.7 }); act(cover, 'carry', tCatch + 0.2, 99);
      ev(tCatch, 'int', { who: cover, pos: [...C, 2.3] });
      const rk = [[tCatch, ...C], [tCatch + 0.35, C[0] - 1, C[1] - side * 1.5]];
      if (T === 'pick_six' || play.result === 'td') {
        jukes(rk, [C[0] - 1, C[1] - side * 1.5], [-54.5, clamp(C[1] * 0.3, -20, 20)], 9.4, 2);
        tEvent = crossX(rk, -50, -1); ev(tEvent, 'td', { who: cover, team: 'D' }); path(cover, rk, { exact: true });
        for (const p of sim.O) pursue(p, tCatch + 0.35 + (p.i % 3) * 0.1); celebrate(cover, 'D', tEvent);
      } else {
        const E = [C[0] - clamp(play.returnYards ?? 14, 3, 60), C[1] - side * 5];
        const tT = runTo(rk, E, 9.2); path(cover, rk, { exact: true }); cover.faceHint = Math.PI;
        for (const p of sim.O) if (p !== tgt) pursue(p, tCatch + 0.35 + (p.i % 3) * 0.1);
        tackle(cover, tT, tgt, E); tEvent = tT; seg(cover, tT + 0.05, 'stop');
      }
    }
    // ball
    const snapT = air(S, 0.3, [L, 0, 0.3], [qb.home[0] + 0.35, 0.1, 1.15]); held(snapT, qb);
    air(tThrow, Tf, [qThrow[0] + 0.4, qThrow[1] + 0.35, 2.05], [...C, zc]); held(tCatch, hero);
    ev(tThrow, 'throw', { who: qb, to: C, T: Tf, deep: dist > 28 });
    // everyone else on offense
    linePass(tThrow);
    if (screen) {
      [2, 3, 4].forEach((i, k) => { const p = sim.O[i]; path(p, [[S, ...p.home], [S + 0.8, p.home[0] - 1, p.home[1]], [tCatch + 0.2, L + 1 + k * 2.2, sg * (6 + k * 2.2)], [tCatch + 2.2, L + 12 + k * 3, sg * (7 + k * 2.5)]]); act(p, 'block', tCatch, tCatch + 3); });
      path(rb, [[S, ...rb.home], [S + 0.5, L - 5.5, sg * 1], [tCatch, ...C]], { exact: true });
    } else { path(rb, [[S, ...rb.home], [S + 0.6, L - 4.4, rb.home[1] * 0.7]], { face: 0 }); act(rb, 'block', S + 0.5, tThrow); }
    const others = [sim.O[7], sim.O[8], sim.O[9], sim.O[10]].filter((p) => p !== tgt);
    others.forEach((p, k) => {
      const d = hail ? [C[0] - 1.5 + k * 1.2, C[1] + (k - 1) * 2.2] : [Math.min(58, p.home[0] + 14 + k * 4), p.home[1] * (k === 1 ? 0.5 : 0.92) + (p.pos === 'TE' ? -3 : 0)];
      path(p, [[S, ...p.home], [S + 0.15, ...p.home], [hail ? tCatch : S + 0.15 + hyp(d[0] - p.home[0], d[1] - p.home[1]) / 8.2, ...d]]);
      if (hail) act(p, 'jump', tCatch - 0.33, tCatch + 0.3, { h: 0.8 });
    });
    // coverage
    const cov = { 8: sim.D[7], 9: sim.D[8], 10: sim.D[10] };
    for (const [oi, d] of Object.entries(cov)) {
      const wr = sim.O[oi]; if (isInt && d === cover) { seg(d, S + 0.2, 'cover', { who: wr, dx: 0.9, dy: 0 }); continue; }
      seg(d, S + 0.2, 'cover', { who: wr, dx: wr === tgt ? (td || yards > 20 ? -1.7 : -0.9) : 0.7, dy: -Math.sign(wr.home[1]) * 0.7 });
      if (hail) { meet(d, tThrow, tCatch, [C[0] + 0.9, C[1] + (oi - 9) * 1.3]); act(d, 'jump', tCatch - 0.3, tCatch + 0.3, { h: 0.85 }); }
      else if (!isInt) pursue(d, tCatch + (wr === tgt ? 0.05 : 0.25));
      if ((f.jumpBall || f.oneHand) && wr === tgt && !hail) { act(d, 'jump', tCatch - 0.3, tCatch + 0.28, { h: 0.8 }); d.segs.find((q) => q.kind === 'cover').dx = -0.5; }
    }
    const fs = sim.D[9];
    if (f.bite) { path(fs, [[S, ...fs.home], [S + 1.0, L + 7, fs.home[1]], [S + 1.5, L + 7.5, fs.home[1]]]); ev(S + 1.0, 'bite', { who: fs }); if (!isInt) pursue(fs, S + 1.6); }
    else if (hail) { meet(fs, S + 0.5, tCatch, [C[0] - 0.9, C[1] - 1.4]); act(fs, 'jump', tCatch - 0.3, tCatch + 0.3, { h: 0.85 }); }
    else { path(fs, [[S, ...fs.home], [tThrow, Math.min(58.5, fs.home[0] + 7), fs.home[1] * 0.6]]); if (!isInt) pursue(fs, tThrow + 0.25, { lead: 0.5 }); }
    [4, 5, 6].forEach((i) => { const p = sim.D[i]; if (screen && p === cover) { path(p, [[S, ...p.home], [tCatch, L + 3, sg * 6]]); return; } path(p, [[S, ...p.home], [S + 1.4, Math.min(58.8, p.home[0] + 3.5), p.home[1] * 1.15]]); if (!isInt) pursue(p, tCatch + 0.15); });
    if (isInt) for (const d of sim.D) if (d !== cover) seg(d, tCatch + 0.4, 'follow', { who: cover, r: 3 + (d.i % 3), a: d.i, lead: true });
    sim.focus = { qb, target: tgt, catchPt: [...C, zc], tThrow, tCatch, cover };
    return tEvent;
  };

  // ---------- RUN (big run, breakaway, tackle for loss, fumble, fumble-return TD, 2-pt run)
  const runPlay = () => {
    const tfl = T === 'tfl', fum = T === 'fumble' || T === 'def_td', two = T === 'two_point';
    const td = (play.result === 'td' && !fum) || (two && play.result === 'good');
    const gain = tfl ? -clamp(yards, 1, 7) : T === 'def_td' ? 5 : fum ? clamp(yards, 2, 30) : yards;
    let start = two ? 2 : td ? yards : clamp(gain + 24, 22, 85);
    if (T === 'def_td') start = clamp(100 - clamp(play.returnYards ?? yards, 8, 95) + gain, 8, 95);
    scrimmage('i', 50 - toEZ(start));
    const [qb, rb] = sim.O, sg = sgnOf(play.dir) || -1;
    if (play.rusher != null) rb.num = play.rusher;
    const gapY = sg * (yards > 12 ? 3.4 : 1.6), tH = S + 0.72, mesh = [L - 3.3, sg * 0.5];
    path(qb, [[S, ...qb.home], [tH, L - 2.9, -sg * 0.25], [tH + 0.8, L - 4.4, -sg * 2.2]], { exact: true }); act(qb, 'handoff', tH - 0.25, tH + 0.2);
    const keys = [[S, ...rb.home], [S + 0.12, ...rb.home], [tH, ...mesh], [tH + 0.42, L + 0.4, gapY]];
    act(rb, 'carry', tH, 99); ev(tH, 'handoff', { who: rb });
    let tEvent, hero = rb, heroTeam = 'O';
    lineRun(sg, tH + 0.5);
    const endX = L + gain, lb = sim.D[5], fs = sim.D[9];
    if (tfl) {
      const E = [L + gain, gapY * 0.6]; keys.length = 3; const tT = runTo(keys, E, 6.5); path(rb, keys, { exact: true });
      if (play.defender != null) lb.num = play.defender; rb.faceHint = 0;
      tackle(rb, tT, lb, E, { big: true, back: true }); tEvent = tT; hero = lb; heroTeam = 'D'; ev(tT, 'tfl', { who: lb });
      seg(rb, tT + 0.05, 'stop'); act(lb, 'celebrate', tT + 1.2, 99, { style: 2 }); sim.hero = lb; sim.heroTeam = 'D';
    } else if (td) {
      const E = [54.5, clamp(gapY * 2.2, -20, 20)], n = f.juke ? 3 : yards > 30 ? 2 : yards > 12 ? 1 : 0;
      if (n) jukes(keys, [L + 0.4, gapY], E, 9.3, n); else runTo(keys, E, 8.6);
      path(rb, keys, { exact: true }); tEvent = crossX(keys, 50) ?? keys[keys.length - 1][0];
      ev(tEvent, two ? 'two_pt' : 'td', { who: rb, team: 'O' }); celebrate(rb, 'O', tEvent);
    } else {
      const E = [Math.min(49.2, endX), gapY * 2 + (f.juke ? sg * 3 : 0)], n = f.juke ? 2 : gain > 22 ? 1 : 0;
      const tT = n ? jukes(keys, [L + 0.4, gapY], E, 9.1, n) : runTo(keys, E, 8.8); path(rb, keys, { exact: true }); rb.faceHint = 0;
      const tk = gain > 12 ? fs : lb; tackle(rb, tT, tk, E, { big: true }); tEvent = tT; seg(rb, tT + 0.05, 'stop');
      if (fum) {                                             // ball pops out, defense scoops it
        const rec = sim.D[4]; if (play.defender != null) rec.num = play.defender;
        const rest = loose(tT, [E[0] + 0.3, E[1], 1.2], [-2.2, sg * 3.2, 4.2], 1.25), tR = tT + 1.25;
        ev(tT, 'fumble', { who: rb, pos: [E[0], E[1], 1.2] }); meet(rec, tT + 0.1, tR, [rest[0], rest[1]], { exact: T === 'def_td' });
        hero = rec; heroTeam = 'D'; ev(tR, 'recover', { who: rec });
        if (T === 'def_td') {
          act(rec, 'scoop', tR - 0.3, tR + 0.25); act(rec, 'carry', tR + 0.25, 99); held(tR, rec);
          const rk = [[tR, rest[0], rest[1]]]; jukes(rk, [rest[0], rest[1]], [-54.5, clamp(rest[1] * 0.4, -20, 20)], 9.3, 2); path(rec, rk, { exact: true });
          tEvent = crossX(rk, -50, -1); ev(tEvent, 'td', { who: rec, team: 'D' });
          for (const p of sim.O) if (p !== rb) pursue(p, tR + 0.3 + (p.i % 3) * 0.12); celebrate(rec, 'D', tEvent);
        } else { act(rec, 'dive', tR - 0.3, tR + 0.3); act(rec, 'down', tR + 0.3, 99); spot(tR, [rest[0], rest[1], 0.16]); tEvent = tR; sim.hero = rec; sim.heroTeam = 'D'; for (const p of sim.O) if (p !== rb) pursue(p, tT + 0.4); stopAll('O', tR + 0.2); stopAll('D', tR + 0.3); }
      }
    }
    spot(0, [L, 0, 0.16]); const sT = air(S, 0.12, [L, 0, 0.3], [qb.home[0] + 0.3, 0, 1.0]); held(sT, qb); held(tH, rb);
    // blockers + defense flow
    const te = sim.O[7]; path(te, [[S, ...te.home], [S + 1.2, te.home[0] + 2.4, te.home[1] - sg]]); act(te, 'block', S + 0.2, tH + 2);
    [[8, 7], [9, 8], [10, 10]].forEach(([oi, di]) => { const wr = sim.O[oi], d = sim.D[di]; seg(wr, S + 0.15, 'cover', { who: d, dx: -1.0, dy: 0 }); act(wr, 'block', S + 1.2, tH + 3); seg(d, S + 0.5, 'hold', { x: d.home[0] - 1, y: d.home[1] }); pursue(d, tH + 0.9, { slow: 0.85 }); });
    [4, 5, 6].forEach((i) => { const p = sim.D[i]; if (tfl && p === lb) return; path(p, [[S, ...p.home], [tH + 0.3, p.home[0] - 1.6, p.home[1] * 0.7 + gapY * 0.3]]); pursue(p, tH + 0.35 + i * 0.03, { lead: 0.2 }); });
    if (!(gain > 12 && !td && !tfl)) pursue(fs, tH + 0.5, { lead: 0.45 });
    sim.focus = { qb, target: rb, tHand: tH };
    if (hero !== rb && !sim.hero) { sim.hero = hero; sim.heroTeam = heroTeam; }
    return tEvent;
  };

  // ---------- SACK / STRIP SACK
  const sackPlay = () => {
    const strip = T === 'strip_sack', scoop = strip && play.result === 'td';
    const ret = clamp(play.returnYards ?? 30, 5, 90);
    scrimmage('gun', 50 - toEZ(scoop ? clamp(100 - ret - 9, 12, 92) : 55));
    const qb = sim.O[0], rb = sim.O[1], de = sim.D[3], rt = sim.O[6];
    if (play.defender != null) de.num = play.defender;
    const tS = S + 2.35, Q = [L - clamp(yards, 5, 11), 0.4];
    path(qb, [[S, ...qb.home], [S + 0.25, ...qb.home], [S + 1.1, L - 7.4, 0], [S + 1.8, L - 7.0, 0.6], [tS, ...Q]], { exact: true, face: 0 });
    act(qb, 'look', S + 1.1, tS - 0.2);
    linePass(tS + 0.2);
    de.segs = de.segs.filter((q) => q.t0 === 0); path(de, [[S, ...de.home], [S + 0.9, L - 1.6, -6.2], [S + 1.6, L - 5.2, -4.8]]);   // speed rush around the edge
    path(rt, [[S, ...rt.home], [S + 0.9, L - 2.2, -4.4], [S + 1.6, L - 3.4, -3.6]], { face: 0 });
    qb.faceHint = 0; tackle(qb, tS, de, Q, { big: true, back: true, from: S + 1.6 }); ev(tS, 'sack', { who: de, qb });
    [8, 9, 10, 7].forEach((oi, k) => { const p = sim.O[oi]; const d = [Math.min(58, p.home[0] + 11 + k * 3), p.home[1] * 0.8]; path(p, [[S, ...p.home], [S + 0.15, ...p.home], [S + 0.15 + hyp(d[0] - p.home[0], d[1] - p.home[1]) / 8.4, ...d]]); });
    [[8, 7], [9, 8], [10, 10]].forEach(([oi, di]) => seg(sim.D[di], S + 0.2, 'cover', { who: sim.O[oi], dx: 0.8, dy: 0 }));
    [4, 5, 6].forEach((i) => { const p = sim.D[i]; path(p, [[S, ...p.home], [S + 1.4, Math.min(58.8, p.home[0] + 3), p.home[1] * 1.1]]); });
    path(rb, [[S, ...rb.home], [S + 0.6, L - 4.4, 1.4]], { face: 0 }); act(rb, 'block', S + 0.5, tS);
    const sT = air(S, 0.3, [L, 0, 0.3], [qb.home[0] + 0.35, 0.1, 1.15]); held(sT, qb);
    let tEvent = tS, hero = de;
    if (strip) {
      const rec = sim.D[1]; const rest = loose(tS, [Q[0], Q[1], 1.5], [-2.6, 2.4, 4.0], 1.2), tR = tS + 1.2;
      ev(tS, 'fumble', { who: qb, pos: [Q[0], Q[1], 1.5] }); meet(rec, tS + 0.1, tR, [rest[0], rest[1]], { exact: scoop }); ev(tR, 'recover', { who: rec });
      if (scoop) {
        hero = rec; act(rec, 'scoop', tR - 0.3, tR + 0.25); act(rec, 'carry', tR + 0.25, 99); held(tR, rec);
        const rk = [[tR, rest[0], rest[1]]]; jukes(rk, [rest[0], rest[1]], [-54.5, clamp(rest[1] * 0.4, -18, 18)], 8.8, 1); path(rec, rk, { exact: true });
        tEvent = crossX(rk, -50, -1); ev(tEvent, 'td', { who: rec, team: 'D' }); for (const p of sim.O) if (p !== qb) pursue(p, tR + 0.3 + (p.i % 3) * 0.12); celebrate(rec, 'D', tEvent);
      } else { act(rec, 'dive', tR - 0.3, tR + 0.3); act(rec, 'down', tR + 0.3, 99); spot(tR, [rest[0], rest[1], 0.16]); tEvent = tR; stopAll('O', tR + 0.2); stopAll('D', tR + 0.3); }
    } else { stopAll('O', tS + 0.3); for (const d of sim.D) if (d !== de) seg(d, tS + 0.5, 'follow', { who: de, r: 2.5 + (d.i % 3), a: d.i }); act(de, 'celebrate', tS + 1.3, 99, { style: 2 }); }
    sim.hero = hero; sim.heroTeam = 'D'; sim.focus = { qb, target: de };
    return tEvent;
  };

  // ---------- FIELD GOAL
  const fgPlay = () => {
    const good = play.result !== 'nogood', dist = clamp(yards, 18, 66);
    scrimmage('fg', 50 - (dist - 17));
    const [h, k] = sim.O; if (play.kicker != null) k.num = play.kicker;
    const tK = S + 1.18, spotP = [L - 7, 0.2, 0.16];
    act(h, 'kneel', 0, tK + 0.7); h.rest = -Math.PI / 2; h.face = -Math.PI / 2;
    path(k, [[S, ...k.home], [S + 0.35, ...k.home], [tK, L - 7.45, -0.25]], { exact: true }); act(k, 'kick', tK - 0.32, tK + 0.45);
    air(S, 0.42, [L, 0, 0.3], [L - 6.8, 0.25, 0.6]); spot(S + 0.42, spotP);
    const Tf = clamp(1.25 + dist * 0.017, 1.4, 2.5), end = [66, good ? 0.7 : 5.6, 2.4];
    air(tK, Tf, spotP, end); const rest = loose(tK + Tf, end, [6, 0, 0], 1.0); spot(tK + Tf + 1.0, rest);
    const tThru = tK + Tf * (60 - spotP[0]) / (end[0] - spotP[0]);
    ev(tK, 'kick', { who: k, T: Tf }); ev(tThru, good ? 'fg_good' : 'fg_miss', { who: k, team: 'O' });
    for (const d of sim.D) { path(d, [[S, ...d.home], [tK, Math.max(L - 3.2, d.home[0] - 4.5), d.home[1] * 0.7]]); if (d.i < 8) { act(d, 'block', S + 0.3, tK - 0.2); act(d, 'jump', tK - 0.1, tK + 0.5, { h: 0.75 }); act(d, 'reach', tK - 0.15, tK + 0.5); } }
    for (let i = 2; i <= 10; i++) act(sim.O[i], 'block', S + 0.1, tK + 0.6);
    if (good) { act(k, 'celebrate', tThru + 0.2, 99, { style: 2 }); seg(h, tThru + 0.2, 'follow', { who: k, r: 1.4, a: 0.5 }); sim.O.forEach((p, i) => { if (i > 1) seg(p, tThru + 0.5 + i * 0.05, 'follow', { who: k, r: 2.2 + (i % 3), a: i * 0.7 }); }); }
    sim.hero = k; sim.heroTeam = 'O'; sim.focus = { qb: h, target: k, tKick: tK, tThru };
    return tThru;
  };

  // ---------- PUNT / KICK RETURN
  const returnPlay = () => {
    const kick = T === 'kick_return', td = play.result === 'td';
    const X0 = td ? clamp(50 - yards, -57, 30) : kick ? -45 : -22, endX = td ? 54.5 : Math.min(48, X0 + yards);
    L = X0; sim.L = X0; sim.noScrimmage = true;
    const r = mk('O', 0, kick ? 'KR' : 'PR', X0, 0); if (play.rusher != null) r.num = play.rusher; else r.num = 11;
    for (let i = 1; i <= 10; i++) mk('O', i, i < 6 ? 'TE' : 'WR', X0 + 9 + (i % 3) * 5.5, (i - 5.5) * 4.6);       // the return wall
    for (let i = 0; i < 11; i++) mk('D', i, i < 5 ? 'LB' : 'S', X0 + (kick ? 26 : 16) + (i % 4) * 4, (i - 5) * 4.4);   // coverage team
    const tC = 1.35;
    for (const p of sim.players) hold(p, 0, p.home[0], p.home[1]);
    air(0, tC, [X0 + 17, 2.5, 15.5], [X0, 0, 1.7]); held(tC, r); act(r, 'catch', tC - 0.4, tC + 0.15, { toward: [X0 + 10, 0], over: false, high: true }); act(r, 'carry', tC + 0.15, 99);
    ev(tC, 'catch', { who: r, pos: [X0, 0, 1.7], field: true }); ev(0.05, 'kickoff', {});
    const keys = [[0, X0, 0], [tC, X0, 0], [tC + 0.5, X0 + 2.5, -1.5]];
    const n = clamp(Math.round((endX - X0) / 22), 1, 4), far = [endX, td ? 16 : 9];
    const tEnd = jukes(keys, [X0 + 2.5, -1.5], far, 9.5, n); path(r, keys, { exact: true });
    sim.D.forEach((d) => { path(d, [[0, ...d.home], [tC, d.home[0] - 9, d.home[1] * 0.8]]); pursue(d, tC, { lead: 0.35 }); });
    sim.O.forEach((p, i) => { if (!i) return; const d = sim.D[i]; seg(p, tC - 0.6, 'cover', { who: d, dx: -1.1, dy: 0, max: 14 }); act(p, 'block', tC + 0.4, tEnd); });
    let tEvent;
    if (td) { tEvent = crossX(keys, 50) ?? tEnd; ev(tEvent, 'td', { who: r, team: 'O' }); celebrate(r, 'O', tEvent); }
    else { const tk = sim.D[9]; tk.segs = tk.segs.filter((q) => q.kind !== 'pursue'); r.faceHint = 0; tackle(r, tEnd, tk, far, { big: true }); tEvent = tEnd; seg(r, tEnd + 0.05, 'stop'); }
    sim.hero = r; sim.heroTeam = 'O'; sim.focus = { qb: r, target: r, tCatch: tC, catchPt: [X0, 0, 1.7] };
    return tEvent;
  };

  // ---------- pick the builder
  const runWords = /\b(run|rush|sneak|handoff|hand-off|carr(y|ies)|dive|sweep)\b/i.test(play.desc || '');
  let tEvent;
  if (T === 'field_goal') tEvent = fgPlay();
  else if (T === 'punt_return' || T === 'kick_return') tEvent = returnPlay();
  else if (T === 'sack' || T === 'strip_sack') tEvent = sackPlay();
  else if (['run', 'breakaway', 'tfl', 'fumble', 'def_td'].includes(T) || (T === 'two_point' && runWords)) tEvent = runPlay();
  else tEvent = passPlay();

  const big = sim.events.some((e) => ['td', 'two_pt', 'fg_good'].includes(e.type));
  sim.tEvent = tEvent; sim.duration = tEvent + (big ? 3.4 : 2.2);
  ev(sim.duration - 0.15, 'whistle');
  sim.events.sort((a, b) => a.t - b.t);
  sim.ballSegs.sort((a, b) => a.t0 - b.t0);
  sim.resultText = big ? (sim.events.find((e) => e.type === 'fg_good') ? "IT'S GOOD!" : sim.events.find((e) => e.type === 'two_pt') ? '2-POINT GOOD!' : 'TOUCHDOWN!')
    : sim.events.find((e) => e.type === 'int') ? 'INTERCEPTED!' : sim.events.find((e) => e.type === 'recover') ? 'FUMBLE!' : sim.events.find((e) => e.type === 'sack') ? 'SACK!'
      : sim.events.find((e) => e.type === 'fg_miss') ? 'NO GOOD' : sim.events.find((e) => e.type === 'tfl') ? 'STUFFED!' : sim.events.find((e) => e.type === 'two_pt_fail') ? 'NO GOOD' : null;
  sim.scoreTeam = big ? ((sim.events.find((e) => ['td', 'two_pt', 'fg_good'].includes(e.type)) || {}).team || 'O') : null;
  sim.points = sim.events.some((e) => e.type === 'td') ? 6 : sim.events.some((e) => e.type === 'fg_good') ? 3 : sim.events.some((e) => e.type === 'two_pt') ? 2 : 0;
  return new Sim(sim);
}

// ---------------------------------------------------------------- the stepper
export class Sim {
  constructor(d) { Object.assign(this, d); this._init = this.players.map((p) => ({ x: p.home[0], y: p.home[1], face: p.rest, num: p.num })); this.reset(); }
  reset() {
    this.t = 0; this.acc = 0; this.ball = { pos: [0, 0, 0.16], vel: [0, 0, 0], held: null, inAir: false, loose: false };
    this.players.forEach((p, i) => { const s = this._init[i]; Object.assign(p, { x: s.x, y: s.y, z: 0, vx: 0, vy: 0, face: s.face, speed: 0, missed: false, auto: [], stopAt: null, pitch: 0 }); });
    this.events = this.events.filter((e) => !e.auto); this.carrier = null; this._ball(0);
  }
  seek(t) { if (t < this.t) this.reset(); while (this.t + DT <= t) this._step(); }
  step(dt) { this.acc += dt; while (this.acc >= DT) { this._step(); this.acc -= DT; } }
  eventsBetween(a, b) { return this.events.filter((e) => e.t > a && e.t <= b); }
  actOf(p, type) { const t = this.t; for (const a of p.acts) if (a.type === type && t >= a.t0 && t < a.t1) return { ...a, ph: clamp((t - a.t0) / Math.max(1e-6, Math.min(a.t1, 98) - a.t0)), el: t - a.t0 }; for (const a of p.auto) if (a.type === type && t >= a.t0 && t < a.t1) return { ...a, ph: clamp((t - a.t0) / (a.t1 - a.t0)), el: t - a.t0 }; return null; }
  _segAt(p, t) { let s = null; for (const q of p.segs) { if (q.t0 > t) break; if (q.kind === 'meet' && t <= q.tT + 0.02) return q; s = q; } return s; }   // a scripted meeting (tackle, interception) wins until it happens
  _ball(t) {
    let s = null; for (const q of this.ballSegs) if (q.t0 <= t) s = q; else break;
    const b = this.ball; if (!s) return; b.held = null; b.inAir = false; b.loose = false; const prev = [...b.pos];
    if (s.kind === 'held') { const h = s.by; b.held = h; b.pos = [h.x + Math.cos(h.face) * 0.28, h.y + Math.sin(h.face) * 0.28, h.z + 1.2]; }
    else if (s.kind === 'air') { const u = Math.min(t, s.t1) - s.t0; b.pos = [s.p0[0] + s.v[0] * u, s.p0[1] + s.v[1] * u, s.p0[2] + s.v[2] * u - 0.5 * G * u * u]; b.inAir = t < s.t1; b.target = s.p1; b.T = s.t1 - s.t0; }
    else if (s.kind === 'loose') { const i = Math.min(s.pts.length - 1, Math.round((t - s.t0) / DT)); b.pos = [...s.pts[i]]; b.loose = true; }
    else b.pos = [...s.pos];
    b.vel = [(b.pos[0] - prev[0]) / DT, (b.pos[1] - prev[1]) / DT, (b.pos[2] - prev[2]) / DT];
    this.carrier = b.held;
  }
  _target(p, t) {
    const s = this._segAt(p, t); if (!s) return { x: p.x, y: p.y };
    if (s.kind === 'hold') return { x: s.x, y: s.y, exact: t < this.S, face: s.face };
    if (s.kind === 'path') {
      const k = s.keys; let x, y;
      if (t <= k[0][0]) [x, y] = [k[0][1], k[0][2]]; else if (t >= k[k.length - 1][0]) [x, y] = [k[k.length - 1][1], k[k.length - 1][2]];
      else for (let i = 1; i < k.length; i++) if (t <= k[i][0]) { const a = k[i - 1], b = k[i], q = (t - a[0]) / Math.max(1e-6, b[0] - a[0]); x = lerp(a[1], b[1], q); y = lerp(a[2], b[2], q); break; }
      return { x, y, exact: !!s.exact, face: s.face };
    }
    if (s.kind === 'meet') { const rem = s.tT - t; if (rem <= 0) return { x: s.pt[0], y: s.pt[1], exact: !!s.exact && rem > -0.05, hit: s.hit }; return { x: s.pt[0], y: s.pt[1], arriveIn: rem, exactMeet: !!s.exact }; }
    if (s.kind === 'cover') { const w = s.who; let x = w.x + s.dx + w.vx * 0.15, y = w.y + s.dy; if (s.max && hyp(x - p.home[0], y - p.home[1]) > s.max) { x = p.x; y = p.y; } return { x, y }; }
    if (s.kind === 'pursue') {
      const c = this.carrier, b = this.ball; let x, y;
      if (c && c.team !== p.team) { const lead = s.lead ?? 0.22, dir = Math.sign(c.vx) || 1; x = c.x + c.vx * lead + s.off[0] * dir * 0.6; y = c.y + c.vy * lead + s.off[1] * 0.5; }
      else if (b.inAir && b.target) { x = b.target[0] + s.off[0] * 0.5; y = b.target[1] + s.off[1]; } else if (c) { x = p.x; y = p.y; } else { x = b.pos[0]; y = b.pos[1]; }
      return { x, y, slow: s.slow, chase: true };
    }
    if (s.kind === 'follow') { const w = s.who; return { x: w.x - Math.cos(s.a) * s.r + (s.lead ? -Math.sign(w.vx || 1) * 2 : 0), y: w.y - Math.sin(s.a) * s.r, jog: !s.lead, faceTo: w }; }
    if (s.kind === 'stop') { if (p.stopAt == null || p.stopSeg !== s) { p.stopSeg = s; p.stopAt = [p.x + p.vx * 0.5, p.y + p.vy * 0.5]; } return { x: p.stopAt[0], y: p.stopAt[1], jog: true }; }
    return { x: p.x, y: p.y };
  }
  _step() {
    const t = this.t + DT, pre = t < this.S && !this.noScrimmage; this.t = t;
    const hash = (n) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
    for (const p of this.players) {
      const o = this._target(p, t); p.tgt = o;
      const down = this.actOf(p, 'down') || this.actOf(p, 'fall') || this.actOf(p, 'dive');
      if (pre || o.exact) { p.vx = (o.x - p.x) / DT; p.vy = (o.y - p.y) / DT; if (pre) p.vx = p.vy = 0; p.x = o.x; p.y = o.y; }
      else if (down && !o.hit && !(o.arriveIn > 0)) { p.vx *= 0.9; p.vy *= 0.9; p.x += p.vx * DT; p.y += p.vy * DT; }
      else {
        const dx = o.x - p.x, dy = o.y - p.y, d = hyp(dx, dy); let vm = (VMAX[p.grp] || 8) * (o.slow || 1) * (o.jog ? 0.45 : 1);
        let sp = Math.min(vm, Math.sqrt(2 * 18 * d));
        if (o.arriveIn > 0) sp = o.exactMeet ? d / o.arriveIn : Math.min(vm * 1.12, Math.max(d / o.arriveIn, d > 0.5 ? vm * 0.35 : 0));
        const wx = d > 0.03 ? dx / d * sp : 0, wy = d > 0.03 ? dy / d * sp : 0, ax = wx - p.vx, ay = wy - p.vy, a = hyp(ax, ay), am = (o.exactMeet ? 60 : 24) * DT;
        if (a > am) { p.vx += ax / a * am; p.vy += ay / a * am; } else { p.vx = wx; p.vy = wy; }
        p.x += p.vx * DT; p.y += p.vy * DT;
      }
      p.exactNow = pre || !!o.exact;
    }
    // nobody runs through anybody
    if (!pre) for (let it = 0; it < 2; it++) for (let i = 0; i < this.players.length; i++) for (let j = i + 1; j < this.players.length; j++) {
      const a = this.players[i], b = this.players[j]; const dx = b.x - a.x, dy = b.y - a.y, d = hyp(dx, dy) || 1e-3, min = 0.92; if (d >= min) continue;
      if ((a.tgt.hit || b.tgt.hit) || this.actOf(a, 'down') || this.actOf(b, 'down') || this.actOf(a, 'celebrate') && b.team === a.team || this.actOf(b, 'celebrate') && b.team === a.team) continue;
      const fa = a.exactNow ? 0 : b.exactNow ? 2 : 1, fb = 2 - fa; if (a.exactNow && b.exactNow) continue;
      const push = (min - d) / 2, ux = dx / d, uy = dy / d; a.x -= ux * push * fa; a.y -= uy * push * fa; b.x += ux * push * fb; b.y += uy * push * fb;
    }
    this._ball(t);
    // chasers who get close but aren't the scripted tackler dive and miss
    const c = this.carrier;
    for (const p of this.players) {
      p.speed = hyp(p.vx, p.vy);
      if (c && p.team !== c.team && p.tgt.chase && !p.missed && !pre && hyp(p.x - c.x, p.y - c.y) < 1.55 && hyp(c.vx, c.vy) > 5 && !this.actOf(c, 'fall') && !this.actOf(c, 'down') && !this.actOf(c, 'celebrate')) {
        p.missed = true; if (hash(p.id * 7.3 + Math.round(this.duration * 10)) < 0.7) { p.auto.push({ type: 'dive', t0: t, t1: t + 0.45 }, { type: 'down', t0: t + 0.45, t1: t + 1.9 }); this.events.push({ t: t + 0.001, type: 'miss', who: p, by: c, auto: true }); this.events.sort((a, b) => a.t - b.t); }
      }
      // facing
      const o = p.tgt, thr = this.actOf(p, 'throw') || this.actOf(p, 'catch') || this.actOf(p, 'catch1'); let want = p.face;
      if (thr && thr.toward && !thr.over) want = Math.atan2(thr.toward[1] - p.y, thr.toward[0] - p.x);
      else if (o.face !== undefined) want = o.face; else if (p.speed > 1.3) want = Math.atan2(p.vy, p.vx);
      else if (o.faceTo) want = Math.atan2(o.faceTo.y - p.y, o.faceTo.x - p.x);
      else if (pre) want = p.rest; else if (this.t > this.S && !this.actOf(p, 'down')) want = Math.atan2(this.ball.pos[1] - p.y, this.ball.pos[0] - p.x);
      const dA = ((want - p.face + Math.PI * 3) % (Math.PI * 2)) - Math.PI; p.face += dA * Math.min(1, DT * (thr || o.face !== undefined ? 14 : 9));
      const j = this.actOf(p, 'jump'); p.z = j ? (j.h || 0.9) * Math.sin(Math.PI * j.ph) : 0;
    }
  }
}
