// All sound is synthesized (no samples): stadium crowd bed that swells on big plays, hits, catches, kicks, whistle,
// touchdown horn, and an optional beat. Routed to the speakers and to a stream for the exported video.
export function createAudio() {
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return { ok: false, resume() {}, event() {}, setMusic() {}, start() {}, stop() {}, stream: null };
  const ctx = new AC(), master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
  const dest = ctx.createMediaStreamDestination ? ctx.createMediaStreamDestination() : null; if (dest) master.connect(dest);
  const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); { const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  let crowd = null, crowdGain = null, music = null, on = { sfx: true, music: false };
  const noise = (dur, type, f, q, g, when = 0) => { const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const gn = ctx.createGain(); const t = ctx.currentTime + when;
    gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(g, t + 0.015); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(fl); fl.connect(gn); gn.connect(master); s.start(t); s.stop(t + dur + 0.05); };
  const tone = (f0, f1, dur, g, type = 'sine', when = 0) => { const o = ctx.createOscillator(); o.type = type; const gn = ctx.createGain(); const t = ctx.currentTime + when; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(g, t + 0.012); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(gn); gn.connect(master); o.start(t); o.stop(t + dur + 0.05); };
  function start() {
    stop(); if (!on.sfx) return; crowd = ctx.createBufferSource(); crowd.buffer = nb; crowd.loop = true; const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 900; f1.Q.value = 0.5;
    crowdGain = ctx.createGain(); crowdGain.gain.value = 0.07; crowd.connect(f1); f1.connect(crowdGain); crowdGain.connect(master); crowd.start();
  }
  function stop() { try { crowd?.stop(); } catch {} crowd = null; if (music) { clearInterval(music.id); music = null; } }
  const swell = (peak, hold = 1.6) => { if (!crowdGain) return; const t = ctx.currentTime; crowdGain.gain.cancelScheduledValues(t); crowdGain.gain.setValueAtTime(crowdGain.gain.value, t); crowdGain.gain.linearRampToValueAtTime(peak, t + 0.25); crowdGain.gain.linearRampToValueAtTime(peak * 0.8, t + hold); crowdGain.gain.linearRampToValueAtTime(0.07, t + hold + 1.6); };
  function event(type, big) {
    if (!on.sfx || ctx.state !== 'running') return;
    if (type === 'snap') { tone(220, 180, 0.09, 0.12, 'square'); noise(0.08, 'highpass', 2500, 1, 0.05); }
    else if (type === 'throw') noise(0.35, 'bandpass', 1400, 2, 0.1);
    else if (type === 'catch' || type === 'recover') { noise(0.07, 'lowpass', 900, 1, 0.3); tone(180, 90, 0.08, 0.2); swell(0.2, 0.8); }
    else if (type === 'int') { noise(0.07, 'lowpass', 900, 1, 0.3); swell(0.3, 1.4); }
    else if (type === 'tackle' || type === 'sack' || type === 'miss') { const g = type === 'miss' ? 0.18 : big ? 0.6 : 0.4; tone(140, 38, 0.22, g); noise(0.14, 'lowpass', 600, 0.7, g * 0.8); if (type !== 'miss') swell(big ? 0.26 : 0.16, 0.7); }
    else if (type === 'kick' || type === 'kickoff') { tone(190, 50, 0.16, 0.5); noise(0.05, 'lowpass', 1200, 1, 0.3); }
    else if (type === 'fumble') { tone(300, 120, 0.2, 0.2, 'triangle'); swell(0.25, 1); }
    else if (type === 'whistle') { for (const f of [2150, 2890]) { const o = ctx.createOscillator(), g = ctx.createGain(), l = ctx.createOscillator(), lg = ctx.createGain(), t = ctx.currentTime; o.frequency.value = f; l.frequency.value = 38; lg.gain.value = 0.05; l.connect(lg); lg.connect(g.gain); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.03); g.gain.setValueAtTime(0.07, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5); o.connect(g); g.connect(master); o.start(t); l.start(t); o.stop(t + 0.55); l.stop(t + 0.55); } }
    else if (['td', 'two_pt', 'fg_good'].includes(type)) { swell(0.42, 2.6); [[196, 0], [247, 0], [294, 0], [392, 0.18]].forEach(([f, w]) => tone(f, f, 1.1, 0.12, 'sawtooth', w)); }
    else if (type === 'fg_miss') swell(0.14, 0.8);
    else if (type === 'whoosh') noise(0.4, 'bandpass', 700, 1.2, 0.16);
  }
  function setMusic(v) { on.music = v; if (!v && music) { clearInterval(music.id); music = null; } }
  function beat() { if (!on.music || music) return; let n = 0; const step = 60 / 104 / 2; const tick = () => { if (ctx.state !== 'running') return; const k = n % 8; if (k === 0 || k === 5) tone(120, 40, 0.18, 0.5); if (k === 4) noise(0.12, 'highpass', 1800, 0.8, 0.16); noise(0.03, 'highpass', 7000, 1, 0.05);
      if (k % 2 === 0) tone([55, 55, 65.4, 49][Math.floor(n / 8) % 4], [55, 55, 65.4, 49][Math.floor(n / 8) % 4], step * 1.6, 0.22, 'sawtooth'); n++; }; music = { id: setInterval(tick, step * 1000) }; }
  return { ok: true, ctx, stream: dest?.stream || null, resume: () => ctx.resume?.(), start: () => { start(); beat(); }, stop, event, setMusic, setSfx: (v) => { on.sfx = v; } };
}
