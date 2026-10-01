// SMASH NEWS Reel Maker — turns the stories you pick into an animated 9:16 reel with an original beat,
// right on your phone (canvas + Web Audio + MediaRecorder). No uploads, no server.
const W = 1080, H = 1920, FPS = 30;
const LIME = '#c6ff3d';
const CAT = {
  dupage: ['📍', 'DUPAGE', '#22c3ee'], news: ['📰', 'NEWS', '#ff5a4f'], deals: ['💰', 'DEAL', '#c6ff3d'], tech: ['📱', 'TECH', '#8b7dff'],
  gaming: ['🎮', 'GAMING', '#b56cff'], auto: ['🚗', 'CARS', '#ff9f1c'], food: ['🍔', 'FOOD', '#ffb020'], energy: ['⚡', 'ENERGY', '#00e0a4'],
  clothing: ['👟', 'DROP', '#ff5fa2'], nfl: ['🏈', 'NFL', '#00b4ff'],
};
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const oc = (p) => 1 - Math.pow(1 - p, 3);
const oexp = (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));
const oback = (p) => 1 + 2.70158 * Math.pow(p - 1, 3) + 1.70158 * Math.pow(p - 1, 2);
const lerp = (a, b, p) => a + (b - a) * p;

export function reelSupported() {
  return !!(window.MediaRecorder && HTMLCanvasElement.prototype.captureStream && (window.AudioContext || window.webkitAudioContext));
}

function tagFor(s) {
  if (s.status === 'BREAKING') return ['🚨', 'BREAKING', '#ff3d2e'];
  if (s.tags?.includes('RECALL')) return ['⚠️', 'RECALL', '#ff8a00'];
  if (s.tags?.includes('DEAL')) return ['💰', 'DEAL', LIME];
  if (s.tags?.includes('LAUNCH') || s.tags?.includes('LIMITED')) return ['📦', 'NEW DROP', '#ff5fa2'];
  if (s.tags?.includes('OPENING')) return ['🏪', 'NOW OPEN', '#22c3ee'];
  if (s.region?.roads) return ['🚧', 'ROADS', '#ffb020'];
  return CAT[s.category] || ['📰', 'NEWS', '#ff5a4f'];
}

async function loadFonts(base) {
  const faces = [new FontFace('ReelAnton', `url(${base}fonts/anton.woff2)`), new FontFace('ReelOswald', `url(${base}fonts/oswald-700.woff2)`, { weight: '700' })];
  await Promise.all(faces.map((f) => f.load().then((ff) => document.fonts.add(ff)).catch(() => {})));
}

function loadImg(url) {
  return new Promise((res) => {
    if (!url) return res(null);
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=1200&h=2000&fit=cover&a=attention&output=jpg&q=85`;
    setTimeout(() => res(null), 9000);
  });
}

function wrap(ctx, text, maxW) {
  const words = text.split(/\s+/); const lines = []; let line = '';
  for (const w of words) { const t = line ? `${line} ${w}` : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line);
  return lines;
}

// ---------- original beat (synthesized offline, then played into the recording)
async function makeBeat(seconds, cuts) {
  const sr = 44100; const n = Math.ceil(seconds * sr);
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new OAC(2, n, sr);
  const out = ctx.createDynamicsCompressor(); out.threshold.value = -14; out.ratio.value = 6; out.connect(ctx.destination);
  const master = ctx.createGain(); master.gain.value = 0.85; master.connect(out);
  const bpm = 124, beat = 60 / bpm;
  const noise = ctx.createBuffer(1, sr, sr); const nd = noise.getChannelData(0); for (let i = 0; i < sr; i++) nd[i] = Math.random() * 2 - 1;
  const kick = (t) => { const o = ctx.createOscillator(); const g = ctx.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18); g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35); o.connect(g).connect(master); o.start(t); o.stop(t + 0.4); };
  const hit = (t, dur, gain, type, f) => { const s = ctx.createBufferSource(); s.buffer = noise; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(fl).connect(g).connect(master); s.start(t); s.stop(t + dur + 0.05); };
  const bassNote = (t, f, d) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(900, t); fl.frequency.exponentialRampToValueAtTime(160, t + d); const g = ctx.createGain(); g.gain.setValueAtTime(0.32, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(fl).connect(g).connect(master); o.start(t); o.stop(t + d + 0.02); };
  const stab = (t, f) => { for (const r of [1, 1.26, 1.5]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f * 4 * r; const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 2400; const g = ctx.createGain(); g.gain.setValueAtTime(0.035, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22); o.connect(fl).connect(g).connect(master); o.start(t); o.stop(t + 0.25); } };
  const roots = [55, 43.65, 65.41, 49];
  const start = 0.9;
  // riser + impact for the intro slam
  { const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true; const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.setValueAtTime(300, 0); fl.frequency.exponentialRampToValueAtTime(6000, start); const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.35, start); g.gain.setValueAtTime(0, start + 0.01); s.connect(fl).connect(g).connect(master); s.start(0); s.stop(start + 0.05); }
  for (let k = 0; start + k * beat < seconds - 0.2; k++) {
    const t = start + k * beat;
    kick(t);
    if (k % 2 === 1) hit(t, 0.18, 0.5, 'highpass', 1500);
    hit(t + beat / 2, 0.05, 0.22, 'highpass', 7000); hit(t, 0.03, 0.1, 'highpass', 9000);
    const bar = Math.floor(k / 4); const f = roots[bar % 4];
    bassNote(t, f, beat * 0.45); bassNote(t + beat / 2, f, beat * 0.4);
    if (k % 8 === 0 || k % 8 === 3 || k % 8 === 6) stab(t + (k % 8 === 3 ? beat / 2 : 0), f);
  }
  kick(start); hit(start, 1.2, 0.6, 'lowpass', 400);
  for (const c of cuts) { // whoosh on every cut
    const s = ctx.createBufferSource(); s.buffer = noise; const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.Q.value = 1.2; fl.frequency.setValueAtTime(400, c - 0.25); fl.frequency.exponentialRampToValueAtTime(5000, c + 0.1);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, c - 0.25); g.gain.exponentialRampToValueAtTime(0.4, c); g.gain.exponentialRampToValueAtTime(0.001, c + 0.25);
    s.connect(fl).connect(g).connect(master); s.start(Math.max(0, c - 0.25)); s.stop(c + 0.3);
  }
  const g = master.gain; g.setValueAtTime(0.85, seconds - 1.2); g.linearRampToValueAtTime(0, seconds - 0.05);
  return ctx.startRendering();
}

// ---------- drawing
function drawCover(ctx, img, t, dur, k) {
  if (!img) return false;
  const p = t / dur;
  const s = lerp(1.18, 1.04, oc(p));
  const iw = img.width, ih = img.height;
  const scale = Math.max(W / iw, H / ih) * s;
  const dw = iw * scale, dh = ih * scale;
  const dx = (W - dw) / 2 + Math.sin(k * 2.1) * 40 * (1 - p), dy = (H - dh) / 2 + lerp(30, -30, p);
  ctx.drawImage(img, dx, dy, dw, dh);
  if (t < 0.3) { // RGB-split glitch on entry
    const a = (0.3 - t) / 0.3;
    ctx.globalAlpha = 0.35 * a; ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(img, dx + 28 * a, dy, dw, dh); ctx.drawImage(img, dx - 28 * a, dy, dw, dh);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  return true;
}

function bug(ctx, t) {
  ctx.save();
  ctx.globalAlpha = clamp(t / 0.4);
  ctx.beginPath(); ctx.arc(84, 120, 22, 0, Math.PI * 2); ctx.lineWidth = 6; ctx.strokeStyle = LIME; ctx.stroke();
  ctx.beginPath(); ctx.arc(84, 120, 9, 0, Math.PI * 2); ctx.fillStyle = LIME; ctx.fill();
  ctx.font = '46px ReelAnton'; ctx.textBaseline = 'middle';
  ctx.fillStyle = LIME; ctx.fillText('SMASH', 124, 122); const w = ctx.measureText('SMASH ').width;
  ctx.fillStyle = '#fff'; ctx.fillText('NEWS', 124 + w, 122);
  ctx.restore();
}

function progress(ctx, i, n, p) {
  const gap = 10, x0 = 60, total = W - 120, w = (total - gap * (n - 1)) / n;
  for (let k = 0; k < n; k++) {
    ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(x0 + k * (w + gap), 50, w, 8);
    ctx.fillStyle = '#fff'; ctx.fillRect(x0 + k * (w + gap), 50, w * (k < i ? 1 : k === i ? p : 0), 8);
  }
}

function pill(ctx, x, y, text, color, p) {
  ctx.save();
  ctx.font = '700 44px ReelOswald';
  const w = ctx.measureText(text).width + 56;
  ctx.beginPath(); ctx.rect(x, y, w * oc(p), 80); ctx.clip();
  ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, 80, 12) : ctx.rect(x, y, w, 80); ctx.fill();
  ctx.fillStyle = color === LIME || color === '#ffb020' ? '#0b1100' : '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(text, x + 28, y + 42);
  ctx.restore();
}

function storyScene(ctx, s, img, t, dur, i, n) {
  const [ico, tag, color] = tagFor(s);
  ctx.fillStyle = '#07080b'; ctx.fillRect(0, 0, W, H);
  if (!drawCover(ctx, img, t, dur, i)) {
    const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, color); g.addColorStop(1, '#07080b');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.font = '520px serif'; ctx.globalAlpha = 0.18; ctx.textAlign = 'center'; ctx.fillText(ico, W / 2, 900); ctx.globalAlpha = 1; ctx.textAlign = 'left';
  }
  // grade: dark bottom, tint top
  let g = ctx.createLinearGradient(0, H * 0.28, 0, H); g.addColorStop(0, 'rgba(7,8,11,0)'); g.addColorStop(0.45, 'rgba(7,8,11,.82)'); g.addColorStop(1, 'rgba(7,8,11,.98)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  g = ctx.createLinearGradient(0, 0, 0, 420); g.addColorStop(0, 'rgba(0,0,0,.65)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, 420);
  // moving light streaks
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  for (let k = 0; k < 5; k++) {
    const x = ((k * 263 + (t + i) * (180 + k * 60)) % (W + 600)) - 300;
    const gr = ctx.createLinearGradient(x, 0, x + 90, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${0.05 + k * 0.012})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.setTransform(1, 0, -0.35, 1, 0, 0); ctx.fillStyle = gr; ctx.fillRect(x, 0, 90 + k * 30, H);
  }
  ctx.restore();
  progress(ctx, i, n, t / dur); bug(ctx, 1);
  // big number
  ctx.save(); ctx.font = '230px ReelAnton'; ctx.textAlign = 'right'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,.55)';
  ctx.globalAlpha = seg(t, 0.1, 0.5); ctx.strokeText(String(i + 1).padStart(2, '0'), W - 60 + lerp(80, 0, oc(seg(t, 0.1, 0.5))), 420); ctx.restore();
  // tag
  const headTop = 1060;
  pill(ctx, 60, headTop - 130, `${ico} ${tag}${s.location?.places?.[0] && s.location.places[0] !== 'DuPage County' ? ` · ${s.location.places[0].toUpperCase()}` : ''}`, color, seg(t, 0.2, 0.55));
  // headline: Anton, auto-size, line-by-line mask reveal, numbers in lime
  const title = String(s.title || '').replace(/\s+[-|–—]\s+[^-|–—]{2,40}$/, '').replace(/^(live updates?|watch live|breaking|update|developing)\s*:\s*/i, '').toUpperCase();
  let fs = 112; let lines;
  for (; fs >= 64; fs -= 6) { ctx.font = `${fs}px ReelAnton`; lines = wrap(ctx, title, W - 120); if (lines.length <= 5) break; }
  if (lines.length > 6) { lines = lines.slice(0, 6); lines[5] = `${lines[5].replace(/\s+\S*$/, '')}…`; }
  const lh = fs * 1.08;
  lines.forEach((ln, k) => {
    const p = oexp(seg(t, 0.35 + k * 0.09, 0.85 + k * 0.09));
    const y = headTop + k * lh;
    ctx.save(); ctx.beginPath(); ctx.rect(0, y - 6, W, lh); ctx.clip();
    let x = 60; const yy = y + lerp(lh, 0, p);
    for (const w of ln.split(' ')) {
      ctx.fillStyle = /[$\d%]/.test(w) ? LIME : '#fff';
      ctx.font = `${fs}px ReelAnton`; ctx.textBaseline = 'top';
      ctx.fillText(w, x, yy); x += ctx.measureText(`${w} `).width;
    }
    ctx.restore();
  });
  // accent bar + source
  const by = headTop + lines.length * lh + 30;
  ctx.fillStyle = color; ctx.fillRect(60, by, lerp(0, 160, oc(seg(t, 0.7, 1.1))), 10);
  ctx.globalAlpha = seg(t, 0.9, 1.3); ctx.font = '700 40px ReelOswald'; ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.textBaseline = 'top';
  ctx.fillText((s.sourceName || '').toUpperCase(), 60, by + 34); ctx.globalAlpha = 1;
}

function introScene(ctx, t, dur, title, sub) {
  ctx.fillStyle = '#07080b'; ctx.fillRect(0, 0, W, H);
  // moving grid
  ctx.strokeStyle = 'rgba(198,255,61,.08)'; ctx.lineWidth = 2;
  for (let x = -((t * 120) % 120); x < W; x += 120) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = -((t * 120) % 120); y < H; y += 120) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  // diagonal slabs
  ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-0.22);
  ctx.fillStyle = LIME; ctx.fillRect(lerp(-1800, -900, oexp(seg(t, 0, 0.7))), -170, 1800, 340);
  ctx.fillStyle = '#fff'; ctx.fillRect(lerp(1800, -900, oexp(seg(t, 0.1, 0.8))), 190, 1800, 18);
  ctx.restore();
  const p = seg(t, 0.75, 1.05);
  if (t > 0.75) {
    ctx.save(); ctx.translate(W / 2, H / 2 - 20); const sc = lerp(2.4, 1, oexp(p)); ctx.scale(sc, sc); ctx.rotate(-0.22);
    ctx.font = '210px ReelAnton'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#0b1100';
    ctx.fillText('SMASH NEWS', 0, 6); ctx.restore();
  }
  if (t > 0.78 && t < 1.2) { ctx.fillStyle = `rgba(255,255,255,${0.85 - (t - 0.78) * 2})`; ctx.fillRect(0, 0, W, H); }
  ctx.globalAlpha = seg(t, 1.1, 1.5); ctx.textAlign = 'center'; ctx.font = '700 58px ReelOswald'; ctx.fillStyle = '#fff';
  ctx.fillText(title, W / 2, H / 2 + 330); ctx.font = '700 40px ReelOswald'; ctx.fillStyle = LIME; ctx.fillText(sub, W / 2, H / 2 + 410);
  ctx.globalAlpha = 1; ctx.textAlign = 'left';
}

function outroScene(ctx, t, dur) {
  ctx.fillStyle = '#07080b'; ctx.fillRect(0, 0, W, H);
  const r = lerp(0, 1, oback(seg(t, 0.05, 0.6)));
  ctx.save(); ctx.translate(W / 2, 760); ctx.scale(r, r);
  for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(0, 0, 120 + k * 70 + ((t * 90) % 70), 0, Math.PI * 2); ctx.strokeStyle = `rgba(198,255,61,${0.5 - k * 0.15})`; ctx.lineWidth = 6; ctx.stroke(); }
  ctx.beginPath(); ctx.arc(0, 0, 70, 0, Math.PI * 2); ctx.fillStyle = LIME; ctx.fill();
  ctx.save(); ctx.rotate(t * 3); ctx.fillStyle = 'rgba(11,17,0,.9)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 70, 0, 0.9); ctx.fill(); ctx.restore();
  ctx.restore();
  ctx.globalAlpha = seg(t, 0.4, 0.8); ctx.textAlign = 'center';
  ctx.font = '150px ReelAnton'; ctx.fillStyle = LIME; const w1 = ctx.measureText('SMASH ').width; const w2 = ctx.measureText('NEWS').width;
  ctx.textAlign = 'left'; ctx.fillText('SMASH', (W - w1 - w2) / 2, 1150); ctx.fillStyle = '#fff'; ctx.fillText('NEWS', (W - w1 - w2) / 2 + w1, 1150);
  ctx.textAlign = 'center'; ctx.globalAlpha = seg(t, 0.7, 1.1); ctx.font = '700 46px ReelOswald'; ctx.fillStyle = 'rgba(255,255,255,.8)';
  ctx.fillText('EVERYTHING NEW. EVERY DAY.', W / 2, 1250); ctx.fillStyle = LIME; ctx.fillText('FOLLOW FOR MORE', W / 2, 1340);
  ctx.globalAlpha = 1; ctx.textAlign = 'left';
  if (t > dur - 0.5) { ctx.fillStyle = `rgba(0,0,0,${seg(t, dur - 0.5, dur)})`; ctx.fillRect(0, 0, W, H); }
}

function wipe(ctx, d) { // lime + black diagonal wipe across the cut
  const q = (d + 0.2) / 0.4;
  ctx.save(); ctx.translate(lerp(-W * 1.2, W * 1.6, q), 0); ctx.transform(1, 0, -0.25, 1, 0, 0);
  ctx.fillStyle = '#0b0f16'; ctx.fillRect(-200, -100, 120, H + 200);
  ctx.fillStyle = LIME; ctx.fillRect(-80, -100, W * 0.7, H + 200); ctx.restore();
}

/** Make the reel. Call from a tap (needs a user gesture for audio). Returns { blob, type, seconds }. */
export async function makeReel(stories, { canvas, base = './', title = 'TOP STORIES', onProgress = () => {}, audioCtx } = {}) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const actx = audioCtx || new AC();
  await actx.resume?.();
  onProgress(0, 'Loading pictures…');
  await loadFonts(base);
  const imgs = await Promise.all(stories.map((s) => loadImg(s.imageUrl)));
  const INTRO = 2.0, OUTRO = 2.6;
  const durs = stories.map((s) => clamp(3.2 + String(s.title).split(/\s+/).length * 0.1, 3.6, 5.2));
  const starts = []; let t = INTRO; for (const d of durs) { starts.push(t); t += d; }
  const total = t + OUTRO;
  const cuts = [INTRO, ...starts.slice(1), t];
  onProgress(0, 'Making the beat…');
  const beat = await makeBeat(total, cuts);
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const day = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase();
  const BEAT = 60 / 124, B0 = 0.9;
  const pulse = (now) => (now < B0 ? 0 : Math.exp(-(((now - B0) % BEAT) / BEAT) * 7));
  const draw = (now) => {
    const pz = pulse(now);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (now > INTRO && now < t) { const z = 1 + pz * 0.014; ctx.setTransform(z, 0, 0, z, (W - W * z) / 2, (H - H * z) / 2); }
    if (now < INTRO) introScene(ctx, now, INTRO, title, day);
    else if (now >= t) outroScene(ctx, now - t, OUTRO);
    else { const i = starts.findLastIndex ? starts.findLastIndex((s) => now >= s) : starts.reduce((a, s, k) => (now >= s ? k : a), 0); storyScene(ctx, stories[i], imgs[i], now - starts[i], durs[i], i, stories.length); }
    for (const c of cuts) if (Math.abs(now - c) < 0.2) { wipe(ctx, now - c); break; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (now > INTRO && now < t && pz > 0.5) { ctx.strokeStyle = `rgba(198,255,61,${(pz - 0.5) * 0.9})`; ctx.lineWidth = 14; ctx.strokeRect(7, 7, W - 14, H - 14); }
  };
  draw(0);
  // record: canvas video + the beat
  const dest = actx.createMediaStreamDestination();
  const src = actx.createBufferSource(); src.buffer = beat; src.connect(dest);
  const stream = canvas.captureStream(FPS);
  dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
  const types = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const type = types.find((x) => MediaRecorder.isTypeSupported?.(x)) || '';
  const rec = new MediaRecorder(stream, { mimeType: type || undefined, videoBitsPerSecond: 9_000_000, audioBitsPerSecond: 192_000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((r) => { rec.onstop = r; });
  onProgress(0, 'Recording your reel…');
  rec.start(500);
  const t0 = actx.currentTime + 0.05;
  src.start(t0);
  await new Promise((resolve) => {
    const tick = () => {
      const now = actx.currentTime - t0; // audio clock keeps picture and beat in sync
      draw(clamp(now, 0, total));
      onProgress(clamp(now / total), 'Recording your reel…');
      if (now >= total) return resolve();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await new Promise((r) => setTimeout(r, 250));
  rec.stop(); await done;
  stream.getTracks().forEach((tr) => tr.stop());
  const blob = new Blob(chunks, { type: (type || 'video/webm').split(';')[0] });
  return { blob, type: blob.type, seconds: total };
}
