// Camera director: turns the play's events into a shot list (wide -> behind-QB -> ball-follow -> slow-mo catch ->
// tracking -> end-zone -> celebration), plus slow-motion windows and freeze frames. Then flies the camera each frame.
import * as THREE from 'three';

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (k) => k * k * (3 - 2 * k);

export const CAMERA_STYLES = { cinematic: 'Cinematic (auto cuts)', broadcast: 'Broadcast wide', behind: 'Behind the offense', sideline: 'Sideline tracking', endzone: 'End-zone' };

export function direct(sim, { style = 'cinematic', fx = 1 } = {}) {
  const ev = (type) => sim.events.find((e) => e.type === type), F = sim.focus || {}, S = sim.S, end = sim.duration;
  const shots = [], warp = [], freeze = [];
  const add = (t0, type, o = {}) => { if (shots.length && t0 <= shots[shots.length - 1].t0 + 0.25) { Object.assign(shots[shots.length - 1], { type, ...o }); return; } shots.push({ t0, type, ...o }); };
  const slow = (a, b, rate) => { if (fx > 0) warp.push({ a, b, rate }); };
  const score = ev('td') || ev('two_pt') || ev('fg_good'), tk = ev('tackle'), ct = ev('catch'), it = ev('int'), th = ev('throw'), ho = ev('handoff'), fu = ev('fumble'), rc = ev('recover'), kick = ev('kick'), sack = ev('sack');
  if (style !== 'cinematic') {
    add(0, { broadcast: 'wide', behind: 'chase', sideline: 'track', endzone: 'endzone' }[style] || 'wide', { soft: true });
    if (score) add(score.t + 0.9, 'celebrate');
  } else if (kick) {
    add(0, 'kickBehind'); add(kick.t + 0.12, 'ballFollow'); const thru = ev('fg_good') || ev('fg_miss'); add(thru.t - 0.55, 'posts'); slow(thru.t - 0.2, thru.t + 0.15, 0.4); if (score) add(thru.t + 1.0, 'celebrate'); else add(thru.t + 1.0, 'wide');
  } else if (sim.noScrimmage) {
    add(0, 'sky'); add(ct.t + 0.5, 'track'); slow(ct.t - 0.15, ct.t + 0.1, 0.5);
    for (let t = ct.t + 3.2, k = 0; t < (score || tk).t - 1.2; t += 2.8, k++) add(t, k % 2 ? 'track' : 'chase');
  } else {
    add(0, 'wide');
    if (th) {
      add(S + 0.45, ev('escape') ? 'qbClose' : 'behindQB');
      add(th.t - 0.1, 'ballFollow');
      const c = ct || it; add(c.t - (th.T > 1.2 ? 0.55 : 0.3), 'catchClose', { pt: c.pos }); slow(c.t - 0.2, c.t + 0.16, 0.28);
      if (fx > 0 && (c.oneHand || c.jump || it)) freeze.push({ t: c.t + 0.02, dur: 0.45 });
      if (!(score && Math.abs(score.t - c.t) < 0.3)) add(c.t + 0.38, 'track');
    } else if (ho) { add(ho.t - 0.25, 'chase'); add(ho.t + 1.3, 'track'); }
    else if (sack) add(S + 0.45, 'behindQB');
    if (sack) { add(sack.t - 0.55, 'low', { who: sack.qb }); slow(sack.t - 0.12, sack.t + 0.22, 0.35); }
    if (fu) { add(fu.t + 0.25, 'looseBall'); if (rc) add(rc.t + 0.35, score ? 'track' : 'low', { who: rc.who }); }
  }
  if (style === 'cinematic') {
    const last = score || tk;
    if (last && !kick) {
      const long = last.t - (ct || it || ho || { t: 0 }).t;
      if (long > 5 && !sim.noScrimmage) for (let t = (ct || it || ho).t + 3, k = 0; t < last.t - 1.4; t += 2.6, k++) add(t, k % 2 ? 'track' : 'chase');
    }
    if (tk && !sack && !(fu && fu.t === tk.t && score)) { add(tk.t - 0.5, 'low', { who: tk.who }); slow(tk.t - 0.1, tk.t + 0.2, tk.big ? 0.35 : 0.6); if (!fu) add(tk.t + 1.1, 'wide', { soft: true }); }
    if (score && !kick) { add(score.t - 0.75, 'endzone', { who: score.who }); slow(score.t - 0.12, score.t + 0.15, 0.45); add(score.t + 1.0, 'celebrate'); }
    else if (sack && !fu) add(sack.t + 1.15, 'celebrate');
  }
  shots.sort((a, b) => a.t0 - b.t0); shots.forEach((s, i) => { s.t1 = shots[i + 1]?.t0 ?? end; });
  warp.sort((a, b) => a.a - b.a);
  return { shots, warp, freeze, style };
}

/** Play-time speed at sim time t (slow-motion windows ease in and out). */
export function rateAt(dir, t) { for (const w of dir.warp) if (t >= w.a - 0.08 && t <= w.b + 0.08) { const k = Math.min(clamp((t - (w.a - 0.08)) / 0.08), clamp(((w.b + 0.08) - t) / 0.08)); return lerp(1, w.rate, smooth(k)); } return 1; }
export function wallDuration(sim, dir) { let w = 0; for (let t = 0; t < sim.duration; t += 1 / 60) w += (1 / 60) / rateAt(dir, t); return w + dir.freeze.reduce((a, f) => a + f.dur, 0); }

const P = new THREE.Vector3(), Tg = new THREE.Vector3();
export function createCameraRig(cam) {
  const st = { shot: null, p: new THREE.Vector3(), t: new THREE.Vector3(), fov: 42, shake: 0, punch: 0, orbit: 0 };
  /** Aim the camera for sim time. dtWall drives smoothing, shake and zoom-punch decay. */
  function update(sim, dir, world, dtWall, aspect) {
    const t = sim.t, shot = dir.shots.find((s) => t >= s.t0 && t < s.t1) || dir.shots[dir.shots.length - 1], F = sim.focus || {};
    const ball = world.ball.position, c = shot.who || sim.carrier || (sim.ball.inAir ? null : sim.hero) || F.target || F.qb, hero = sim.hero || c;
    const subj = c || { x: ball.x, y: ball.y, vx: 1, vy: 0 };
    const defHero = sim.heroTeam === 'D' && sim.carrier && sim.carrier.team === 'D';
    const d = defHero ? -1 : 1, side = (subj.y >= 0 ? 1 : -1), wide = aspect > 1, L = sim.L;
    let fov = wide ? 36 : 42;
    switch (shot.type) {
      case 'wide': if (wide) { P.set(ball.x + 2 * d, -36, 14); Tg.set(ball.x + 2 * d, ball.y * 0.4, 0); } else { P.set(ball.x - 15.5 * d, ball.y * 0.4, 10.5); Tg.set(ball.x + 7 * d, ball.y * 0.65, 0.4); } break;
      case 'behindQB': { const q = F.qb, tg = F.target || q; P.set(q.x - 6.4, q.y - (tg.y - q.y) * 0.03, 3.1); Tg.set(q.x + 10, lerp(q.y, tg.y, 0.07), 1.0); fov = wide ? 44 : 48; break; }
      case 'qbClose': { const q = F.qb; P.set(q.x + 4.2, q.y - 3.4, 1.5); Tg.set(q.x, q.y, 1.5); break; }
      case 'ballFollow': { const tg = sim.ball.target || [ball.x + 10, ball.y, 1]; const dx = tg[0] - ball.x, dy = tg[1] - ball.y, n = Math.hypot(dx, dy) || 1; P.set(ball.x - dx / n * 7.5, ball.y - dy / n * 7.5, Math.max(2.2, ball.z + 1.1)); Tg.set(lerp(ball.x, tg[0], 0.4), lerp(ball.y, tg[1], 0.4), lerp(ball.z, tg[2] ?? 1.5, 0.4)); fov = wide ? 40 : 46; break; }
      case 'catchClose': { const pt = shot.pt || [subj.x, subj.y, 1.8], s2 = pt[1] >= 0 ? 1 : -1; P.set(pt[0] + 4.4, pt[1] - s2 * 4.6, 0.8); Tg.set(pt[0], pt[1], pt[2] - 0.55); fov = wide ? 30 : 36; break; }
      case 'track': P.set(subj.x - 5.5 * d, subj.y - side * 8.2, 2.5); Tg.set(subj.x + 3 * d, subj.y, 1.15); break;
      case 'chase': P.set(subj.x - 8 * d, subj.y + 0.6, 3.1); Tg.set(subj.x + 9 * d, subj.y, 0.9); fov = wide ? 42 : 48; break;
      case 'endzone': { const X = d > 0 ? 58.8 : -58.8; P.set(X, subj.y * 0.55 + 1.2, 1.7); Tg.set(subj.x, subj.y, 1.25); fov = wide ? 34 : 40; break; }
      case 'low': P.set(subj.x + 3.6 * d, subj.y - side * 3.8, 0.42); Tg.set(subj.x, subj.y, 0.95); fov = wide ? 40 : 46; break;
      case 'looseBall': P.set(ball.x + 4.5, ball.y - 4.5, 1.2); Tg.set(ball.x, ball.y, 0.5); break;
      case 'celebrate': { const h = hero; st.orbit += dtWall * 0.55; const a = st.orbit + (d > 0 ? 0.6 : 2.6); P.set(h.x + Math.cos(a) * 4.9, h.y + Math.sin(a) * 4.9, 1.45); Tg.set(h.x, h.y, 1.45); fov = wide ? 34 : 40; break; }
      case 'kickBehind': P.set(L - 13.5, 1.0, 2.7); Tg.set(60, 0, 4.4); fov = wide ? 40 : 46; break;
      case 'posts': P.set(67, 2.4, 2.0); Tg.set(ball.x, ball.y, Math.max(3, ball.z)); fov = wide ? 44 : 50; break;
      case 'sky': P.set(subj.x - 8.5, subj.y + 3.2, 1.3); Tg.set(lerp(subj.x, ball.x, 0.6), lerp(subj.y, ball.y, 0.6), lerp(1.5, ball.z, 0.6)); fov = wide ? 46 : 52; break;
      default: P.set(ball.x - 15, 0, 10); Tg.set(ball.x + 6, 0, 0);
    }
    if (st.shot !== shot || st.sim !== sim) { st.shot = shot; st.sim = sim; st.p.copy(P); st.t.copy(Tg); st.fov = fov; if (shot.type !== 'celebrate') st.orbit = 0; }
    const k = 1 - Math.exp(-dtWall * (shot.soft ? 4 : 7)); st.p.lerp(P, k); st.t.lerp(Tg, 1 - Math.exp(-dtWall * 10)); st.fov = lerp(st.fov, fov, k);
    st.shake = Math.max(0, st.shake - dtWall * 2.6); st.punch = Math.max(0, st.punch - dtWall * 3.2);
    const sh = st.shake * st.shake, n = performance.now() * 0.06;
    cam.position.set(st.p.x + Math.sin(n * 1.7) * sh * 0.35, st.p.y + Math.cos(n * 2.3) * sh * 0.35, Math.max(0.3, st.p.z + Math.sin(n * 2.9) * sh * 0.3));
    cam.lookAt(st.t.x, st.t.y, st.t.z); cam.fov = st.fov - st.punch * 7; cam.updateProjectionMatrix();
    return shot;
  }
  return { update, shake: (v) => { st.shake = Math.max(st.shake, v); }, punch: (v = 1) => { st.punch = Math.max(st.punch, v); }, reset: () => { st.shot = null; st.shake = 0; st.punch = 0; } };
}
