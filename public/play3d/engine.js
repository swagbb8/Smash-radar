// The engine: play description -> parsed play -> simulation -> 3D scene + camera -> frames on the output canvas.
// Plays a single clip or a whole highlight reel (title cards, transitions, final card) and can record it to a video.
import { parsePlay, PLAY_TYPES } from './parser.js';
import { buildPlay } from './sim.js';
import { createWorld } from './scene.js';
import { direct, rateAt, wallDuration, createCameraRig } from './cameras.js';
import * as HUD from './hud.js';
import { createAudio } from './audio.js';

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const DEF_HERO = new Set(['interception', 'pick_six', 'def_td', 'sack', 'strip_sack', 'tfl']);
export const SIZES = { '9:16': [720, 1280], '16:9': [1280, 720], '1:1': [960, 960], tiny: [144, 256] };
const ordinal = (n) => ['1ST', '2ND', '3RD', '4TH'][n - 1] || '1ST';

/** cfg: {desc, hint, teams:[hero, opp], style:{anim, camera, music, sfx}, duration, score:[a,b], quarter, clock, down} */
export function makeClip(cfg) {
  const play = cfg.play || parsePlay(cfg.desc, cfg.hint || {});
  const sim = buildPlay(play);
  const fx = cfg.style?.anim === 'clean' ? 0 : cfg.style?.anim === 'arcade' ? 1.5 : 1;
  const dir = direct(sim, { style: cfg.style?.camera || 'cinematic', fx });
  const heroDef = DEF_HERO.has(play.type), [hero, opp] = cfg.teams;
  const off = { ...(heroDef ? opp : hero), home: !heroDef }, def = { ...(heroDef ? hero : opp), home: heroDef };
  const natural = wallDuration(sim, dir), speed = cfg.duration ? clamp(natural / cfg.duration, 0.7, 1.35) : 1;
  const yd = sim.noScrimmage ? null : Math.round(50 - sim.L);
  const down = cfg.down || (cfg.realGame && !sim.noScrimmage && play.type !== 'field_goal' && play.type !== 'two_point' ? `BALL ON ${def.abbr} ${yd}` : sim.noScrimmage ? (play.type === 'kick_return' ? 'KICKOFF' : 'PUNT') : play.type === 'two_point' ? '2-PT TRY' : play.type === 'field_goal' ? `4TH DOWN · ${play.yards}-YD KICK` : `${ordinal(1 + (play.yards % 3))} & ${yd <= 10 ? 'GOAL' : 10} · ${off.abbr === def.abbr ? '' : def.abbr + ' '}${yd}`);
  return { cfg, play, sim, dir, fx, off, def, heroDef, natural, speed, wall: natural / speed, down, label: PLAY_TYPES[play.type] || play.type };
}

export async function createEngine(out, { onState } = {}) {
  const gl = document.createElement('canvas'); const world = await createWorld(gl); const rig = createCameraRig(world.cam);
  const x = out.getContext('2d'), ghost = document.createElement('canvas'), gx = ghost.getContext('2d');
  const audio = createAudio();
  let W = 720, H = 1280, raf = 0, run = null, last = 0;
  function setSize(key) { [W, H] = SIZES[key] || SIZES['9:16']; out.width = W; out.height = H; ghost.width = W; ghost.height = H; world.resize(W, H); }
  setSize('9:16');

  const board = (c, sc) => (c.cfg.swap ? { teams: [c.cfg.teams[1], c.cfg.teams[0]], score: [sc[1], sc[0]] } : { teams: c.cfg.teams, score: sc });
  function prime(c) { c.sim.reset(); world.dressFor(c.sim, c.off, c.def); rig.reset(); world.ringColor(c.heroDef ? c.def.color : c.off.color); world.sync(c.sim, 0, c.fx); rig.update(c.sim, c.dir, world, 1, W / H); }
  function scoreFor(c, st) { const s = [...st.score]; if (c.sim.points && c.sim.t >= c.sim.tEvent) { const heroScores = (c.sim.scoreTeam === 'D') === c.heroDef; s[heroScores ? 0 : 1] += c.sim.points; } return c.cfg.scoreAfter && c.sim.t >= c.sim.tEvent ? c.cfg.scoreAfter : s; }

  let manual = false, ema = 0.016, nSlow = 0, low = false;
  function frame(now) {
    raf = requestAnimationFrame(frame); if (!run || manual) return;
    const raw = (now - last) / 1000; last = now; step(clamp(raw, 0, 0.05));
    // slow phone? drop shadows and render a bit smaller so the play stays smooth
    ema = ema * 0.92 + raw * 0.08; if (!low && ema > 0.043 && ++nSlow > 45) { low = true; world.lowPower(); }
  }
  function step(dtWall) {
    if (!run) return; const r = run, c = r.clips[r.i]; r.el += dtWall; r.total += dtWall;
    let simDt = 0, blur = 0, speedK = 0, flash = 0;
    if (r.phase === 'play') {
      const fr = c.dir.freeze.find((f) => !f.done && c.sim.t >= f.t);
      if (fr) { fr.left = (fr.left ?? fr.dur) - dtWall; if (fr.left <= 0) fr.done = true; flash = clamp((fr.left - fr.dur + 0.18) / 0.18); r.frozen = true; }
      else { r.frozen = false; const t0 = c.sim.t; simDt = dtWall * rateAt(c.dir, c.sim.t) * c.speed; c.sim.step(simDt);
        for (const e of c.sim.eventsBetween(t0, c.sim.t)) onEvent(c, e, r); }
      world.sync(c.sim, r.frozen ? 0 : simDt, c.fx); const shot = rig.update(c.sim, c.dir, world, dtWall, W / H);
      const car = c.sim.carrier; if (car && car.speed > 7.5 && (shot.type === 'track' || shot.type === 'chase') && c.fx > 0) { speedK = clamp((car.speed - 7.5) / 2) * Math.min(1, c.fx); blur = 0.28 * Math.min(1, c.fx); }
      if (c.sim.ball.inAir && shot.type === 'ballFollow' && c.fx > 0) blur = 0.2;
      r.slow = rateAt(c.dir, c.sim.t) < 0.8 || r.frozen;
    } else if (r.phase === 'title' && r.el < 0.05) prime(c);
    world.render();
    // ---- composite: 3D frame (+ motion blur) -> effects -> HUD
    x.globalAlpha = 1; x.drawImage(gl, 0, 0, W, H);
    if (blur > 0) { x.globalAlpha = blur; x.drawImage(ghost, 0, 0); x.globalAlpha = 1; }
    gx.drawImage(out, 0, 0);
    HUD.drawSpeedLines(x, W, H, speedK, Math.floor(r.total * 24));
    HUD.drawVignette(x, W, H, flash + (r.flash = Math.max(0, (r.flash || 0) - dtWall * 3.5)));
    const st = r.state;
    if (r.phase === 'title') {
      const k = clamp(r.el / 0.3) * clamp((r.titleDur - r.el) / 0.25);
      HUD.drawCard(x, W, H, { kicker: r.clips.length > 1 ? `Play ${r.i + 1} of ${r.clips.length}` : c.label, title: (r.clips.length > 1 ? c.label : (c.sim.resultText || c.label)).toUpperCase(), sub: c.cfg.desc, k, color: c.off.home ? c.off.color === '#ffffff' ? '#c6ff3d' : '#c6ff3d' : '#c6ff3d' });
      if (r.el >= r.titleDur) { r.phase = 'play'; r.el = 0; audio.event('whoosh'); }
    } else if (r.phase === 'play') {
      const sc = scoreFor(c, st);
      HUD.drawScoreboard(x, W, H, { ...board(c, sc), quarter: c.cfg.quarter || 'Q1', clock: c.cfg.clock || '', down: c.sim.t < c.sim.tEvent ? c.down : null, flash: r.scoreFlash > 0 ? (c.cfg.swap ? 1 - r.flashTeam : r.flashTeam) : -1, flashK: clamp(r.scoreFlash || 0) });
      r.scoreFlash = Math.max(0, (r.scoreFlash || 0) - dtWall * 1.2);
      HUD.drawBrand(x, W, H); if (r.slow && c.fx > 0) HUD.drawTag(x, W, H, 'SLOW-MO');
      HUD.drawCaption(x, W, H, c.label, c.cfg.desc, c.heroDef ? c.def.color : c.off.color, clamp(r.el / 0.4) * (r.slamAt != null ? clamp(1 - (r.total - r.slamAt) * 2) + clamp((r.total - r.slamAt - 2.2) * 2) : 1));
      if (r.slamAt != null) HUD.drawSlam(x, W, H, r.slamText, r.total - r.slamAt, r.slamColor);
      if (c.sim.t >= c.sim.duration) { st.score = c.cfg.scoreAfter ? [...c.cfg.scoreAfter] : scoreFor(c, st); r.slamAt = null; if (r.i < r.clips.length - 1) { r.phase = 'wipe'; r.el = 0; audio.event('whoosh'); } else if (r.clips.length > 1 || r.finalCard) { r.phase = 'final'; r.el = 0; } else finish(); }
    } else if (r.phase === 'wipe') {
      HUD.drawScoreboard(x, W, H, { ...board(c, st.score), quarter: c.cfg.quarter || 'Q1', clock: c.cfg.clock || '' });
      const k = r.el / 0.7; if (k >= 0.5 && !r.swapped) { r.swapped = true; r.i++; prime(r.clips[r.i]); }
      HUD.drawWipe(x, W, H, k); if (k >= 1) { r.swapped = false; r.phase = 'title'; r.el = 0.06; }
    } else if (r.phase === 'final') {
      HUD.drawCard(x, W, H, { kicker: r.reelTitle || 'Highlights', title: 'FINAL', ...board(c, st.score), sub: `${r.clips.length} plays · made with SMASH 3D`, k: clamp(r.el / 0.35) });
      if (r.el > 2.6) finish();
    }
    onState?.({ phase: r.phase, i: r.i, n: r.clips.length, progress: clamp(r.total / r.wallTotal) });
  }
  function onEvent(c, e, r) {
    const big = e.big || ['td', 'two_pt', 'fg_good', 'sack', 'int'].includes(e.type); audio.event(e.type, big);
    const at = e.who ? [e.who.x, e.who.y, 0.6] : [c.sim.ball.pos[0], c.sim.ball.pos[1], 0.5];
    if (c.fx > 0) {
      if (e.type === 'tackle' || e.type === 'sack') { world.emit(e.pos ? [e.pos[0], e.pos[1], 0.7] : at, 18 * c.fx, 'impact'); world.emit(at, 14, 'turf'); rig.shake(big ? 1 : 0.6); }
      if (e.type === 'miss') { world.emit(at, 8, 'turf'); }
      if (e.type === 'catch' || e.type === 'int') { rig.punch(1); world.emit(e.pos || at, 8, 'impact'); }
      if (e.type === 'kick') { rig.shake(0.3); world.emit(at, 8, 'turf'); }
      if (e.type === 'fumble') rig.shake(0.5);
      if (['td', 'two_pt', 'fg_good'].includes(e.type)) { rig.punch(1); r.flash = 0.6; world.emit(e.type === 'fg_good' ? [60, 0, 6] : [at[0], at[1], 2.5], 150, 'confetti', (e.team === 'D' ? c.def : c.off).color); }
    }
    const text = { td: 'TOUCHDOWN!', two_pt: '2-POINT GOOD!', fg_good: "IT'S GOOD!", fg_miss: 'NO GOOD', int: 'INTERCEPTED!', sack: 'SACK!', fumble: 'FUMBLE!', tfl: 'STUFFED!', oob: 'FIRST DOWN!', two_pt_fail: 'NO GOOD', escape: 'ESCAPES!' }[e.type] || (e.type === 'tackle' && e.big && !c.sim.resultText ? 'BIG HIT!' : null);
    if (text && !(e.type === 'fumble' && c.sim.events.some((q) => q.type === 'sack'))) { r.slamAt = r.total; r.slamText = text; r.slamColor = (e.team === 'D' || c.heroDef ? c.def : c.off).color; if (r.slamColor.toLowerCase() === '#ffffff') r.slamColor = '#c6ff3d'; }
    if (['td', 'two_pt', 'fg_good'].includes(e.type)) { r.scoreFlash = 1; r.flashTeam = ((e.team === 'D') === c.heroDef) ? 0 : 1; }
  }
  function finish() { const r = run; run = null; audio.stop(); r?.resolve?.(); onState?.({ phase: 'done', progress: 1 }); }

  /** Play clips in order. opts: {titles, finalCard, reelTitle, score:[a,b]} — resolves when done. */
  function play(clips, opts = {}) {
    stop(); if (!clips.length) return Promise.resolve();
    for (const c of clips) { c.sim.reset(); c.dir.freeze.forEach((f) => { f.done = false; f.left = undefined; }); }
    const titleDur = opts.titles === false ? 0.01 : clips.length > 1 ? 1.5 : 1.0;
    return new Promise((resolve) => {
      run = { clips, i: 0, phase: 'title', el: 0, total: 0, titleDur, state: { score: [...(opts.score || clips[0].cfg.score || [0, 0])] }, finalCard: opts.finalCard, reelTitle: opts.reelTitle, resolve,
        wallTotal: clips.reduce((a, c) => a + c.wall + titleDur + 0.7, 0) + (clips.length > 1 || opts.finalCard ? 2.6 : 0) };
      prime(clips[0]); audio.resume(); audio.setMusic(!!clips[0].cfg.style?.music); audio.setSfx(clips[0].cfg.style?.sfx !== false); audio.start(); last = performance.now();
    });
  }
  function stop() { if (run) { const r = run; run = null; audio.stop(); r.resolve?.(); } }

  /** Play + record to a real video file. Returns {blob, type}. */
  async function record(clips, opts = {}) {
    const stream = out.captureStream(30); if (audio.stream) for (const tr of audio.stream.getAudioTracks()) stream.addTrack(tr);
    const type = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
    if (!type) throw new Error('This browser cannot record video');
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6_000_000 }), chunks = []; rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise((res) => { rec.onstop = res; }); rec.start(250);
    await play(clips, opts); await new Promise((r) => setTimeout(r, 250)); rec.stop(); await done;
    return { blob: new Blob(chunks, { type: type.split(';')[0] }), type: type.split(';')[0] };
  }
  /** Draw one still of a clip at sim time t (used for thumbnails and tests). */
  function still(c, t) { prime(c); c.sim.seek(t); world.sync(c.sim, 1 / 60, c.fx); for (let i = 0; i < 3; i++) rig.update(c.sim, c.dir, world, 1, W / H); world.sync(c.sim, 0, c.fx); world.render(); x.drawImage(gl, 0, 0, W, H); HUD.drawVignette(x, W, H, 0); HUD.drawScoreboard(x, W, H, { ...board(c, c.cfg.score || [0, 0]), quarter: c.cfg.quarter || 'Q1', clock: c.cfg.clock || '', down: c.down }); }
  raf = requestAnimationFrame(frame);
  return { setSize, play, stop, record, still, audio, world, tick: (dt) => step(dt), setManual: (v) => { manual = v; }, get size() { return [W, H]; }, get playing() { return !!run; } };
}
