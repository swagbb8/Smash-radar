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


// ---------- typography: one font string for measuring AND drawing, laid out once (so words always line up)
const HEAD = (fs) => `${fs}px ReelAnton, Impact, 'Arial Black', sans-serif`;
const BODY = (fs) => `700 ${fs}px ReelOswald, 'Arial Narrow', Arial, sans-serif`;

function layoutHeadline(ctx, title, maxW, maxLines) {
  let fs = 118, lines;
  for (; fs >= 62; fs -= 4) {
    ctx.font = HEAD(fs);
    lines = []; let line = '';
    for (const w of title.split(/\s+/).filter(Boolean)) { const t = line ? `${line} ${w}` : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line);
    if (lines.length <= maxLines) break;
  }
  if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s+\S*$/, '')}…`; }
  ctx.font = HEAD(fs);
  const lh = Math.round(fs * 1.06);
  const words = [];
  lines.forEach((ln, li) => {
    let idx = 0;
    for (const w of ln.split(' ')) {
      const x = ctx.measureText(ln.slice(0, idx)).width; // exact position from the real line (kerning included)
      words.push({ w, x, li, width: ctx.measureText(w).width, hot: /[$\d%]|FREE|NEW|RECALL|BREAKING/.test(w) });
      idx += w.length + 1;
    }
  });
  return { fs, lh, lines, words };
}

// ---------- reusable FX
let GRAIN = null;
function grain(ctx, t) {
  if (!GRAIN) {
    GRAIN = document.createElement('canvas'); GRAIN.width = GRAIN.height = 256;
    const g = GRAIN.getContext('2d'); const d = g.createImageData(256, 256);
    for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 22; }
    g.putImageData(d, 0, 0);
  }
  const ox = Math.floor((t * 977) % 256), oy = Math.floor((t * 613) % 256);
  ctx.save(); ctx.globalCompositeOperation = 'overlay';
  for (let x = -ox; x < W; x += 256) for (let y = -oy; y < H; y += 256) ctx.drawImage(GRAIN, x, y);
  ctx.restore();
}
const SPARKS = Array.from({ length: 46 }, (_, k) => ({ x: (k * 389) % W, y: (k * 733) % H, s: 2 + (k % 4) * 1.6, v: 40 + (k % 7) * 22, ph: k }));
function sparks(ctx, t, color = LIME, a = 1) {
  ctx.save();
  for (const p of SPARKS) {
    const y = (p.y - t * p.v) % H; const yy = y < 0 ? y + H : y;
    ctx.globalAlpha = a * (0.25 + 0.35 * Math.sin(t * 3 + p.ph));
    ctx.fillStyle = p.ph % 3 ? '#fff' : color;
    ctx.beginPath(); ctx.arc(p.x + Math.sin(t + p.ph) * 18, yy, p.s, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
function leak(ctx, t, color) {
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  const x = W * (0.5 + 0.45 * Math.sin(t * 0.7)), y = H * (0.3 + 0.2 * Math.cos(t * 0.5));
  const g = ctx.createRadialGradient(x, y, 0, x, y, 900); g.addColorStop(0, hexA(color, 0.35)); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
}
function hexA(h, a) { const n = parseInt((h || '#ffffff').slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
function rays(ctx, t, color, a) {
  ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(t * 0.35); ctx.globalAlpha = a;
  for (let k = 0; k < 18; k++) { ctx.rotate((Math.PI * 2) / 18); ctx.fillStyle = k % 2 ? hexA(color, 0.10) : 'rgba(255,255,255,0.03)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-90, -1600); ctx.lineTo(90, -1600); ctx.fill(); }
  ctx.restore();
}
function ticker(ctx, t, text, color) {
  const y = H - 118;
  ctx.save(); ctx.fillStyle = color; ctx.fillRect(0, y, W, 74);
  ctx.font = BODY(40); ctx.textBaseline = 'middle'; ctx.fillStyle = color === LIME ? '#0b1100' : '#fff';
  const unit = `${text}   ✦   `; const uw = ctx.measureText(unit).width; let x = -((t * 260) % uw);
  for (; x < W; x += uw) ctx.fillText(unit, x, y + 39);
  ctx.restore();
}

// ---------- photo
function drawCover(ctx, img, t, dur, k, color) {
  if (!img) {
    const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, hexA(color, 0.9)); g.addColorStop(1, '#07080b');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); rays(ctx, t, color, 1); return;
  }
  const p = t / dur;
  const enter = oexp(seg(t, 0, 0.6));
  const s = lerp(1.45, 1.12, enter) - p * 0.06;
  const iw = img.width, ih = img.height;
  const scale = Math.max(W / iw, H / ih) * s;
  const dw = iw * scale, dh = ih * scale;
  const dx = (W - dw) / 2 + Math.sin(k * 2.1) * 50 * (1 - p), dy = (H - dh) / 2 + lerp(40, -40, p);
  ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(lerp(k % 2 ? -0.05 : 0.05, 0, enter) + Math.sin(t * 0.8) * 0.006); ctx.translate(-W / 2, -H / 2);
  ctx.drawImage(img, dx, dy, dw, dh);
  if (t < 0.35) { // RGB split + zoom-blur entry
    const a = 1 - t / 0.35;
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.45 * a; ctx.drawImage(img, dx + 40 * a, dy, dw, dh); ctx.drawImage(img, dx - 40 * a, dy, dw, dh);
    ctx.globalAlpha = 0.25 * a; ctx.drawImage(img, dx - dw * 0.04 * a, dy - dh * 0.04 * a, dw * (1 + 0.08 * a), dh * (1 + 0.08 * a));
  }
  ctx.restore();
  // duotone grade toward the story color
  ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = hexA(color, 0.35); ctx.fillRect(0, 0, W, H); ctx.restore();
}

function bug(ctx, t) {
  ctx.save();
  const p = oback(seg(t, 0, 0.5));
  ctx.translate(84, 120); ctx.scale(p, p);
  ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.lineWidth = 6; ctx.strokeStyle = LIME; ctx.stroke();
  ctx.save(); ctx.rotate(t * 4); ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 22, 0, 0.9); ctx.fillStyle = hexA(LIME, 0.6); ctx.fill(); ctx.restore();
  ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fillStyle = LIME; ctx.fill();
  ctx.restore();
  ctx.save(); ctx.globalAlpha = seg(t, 0.1, 0.4);
  ctx.font = HEAD(46); ctx.textBaseline = 'middle'; ctx.fillStyle = LIME; ctx.fillText('SMASH', 124, 122);
  const w = ctx.measureText('SMASH ').width; ctx.fillStyle = '#fff'; ctx.fillText('NEWS', 124 + w, 122); ctx.restore();
}

function progress(ctx, i, n, p) {
  const gap = 10, x0 = 60, total = W - 120, w = (total - gap * (n - 1)) / n;
  for (let k = 0; k < n; k++) {
    ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(x0 + k * (w + gap), 50, w, 8);
    ctx.fillStyle = '#fff'; ctx.fillRect(x0 + k * (w + gap), 50, w * (k < i ? 1 : k === i ? p : 0), 8);
  }
}

function storyScene(ctx, s, L, img, t, dur, i, n) {
  const [ico, tag, color] = tagFor(s);
  ctx.fillStyle = '#07080b'; ctx.fillRect(0, 0, W, H);
  drawCover(ctx, img, t, dur, i, color);
  leak(ctx, t + i, color);
  // grade
  let g = ctx.createLinearGradient(0, H * 0.25, 0, H); g.addColorStop(0, 'rgba(7,8,11,0)'); g.addColorStop(0.42, 'rgba(7,8,11,.86)'); g.addColorStop(1, 'rgba(7,8,11,.98)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  g = ctx.createLinearGradient(0, 0, 0, 420); g.addColorStop(0, 'rgba(0,0,0,.65)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, 420);
  // light streaks
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  for (let k = 0; k < 5; k++) {
    const x = ((k * 263 + (t + i) * (220 + k * 70)) % (W + 700)) - 350;
    const gr = ctx.createLinearGradient(x, 0, x + 110, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${0.05 + k * 0.014})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.setTransform(1, 0, -0.35, 1, 0, 0); ctx.fillStyle = gr; ctx.fillRect(x, 0, 110 + k * 30, H);
  }
  ctx.restore();
  sparks(ctx, t + i * 3, color, 0.7);
  progress(ctx, i, n, t / dur); bug(ctx, t + (i ? 1 : 0));
  // big rolling number
  ctx.save();
  const np = oexp(seg(t, 0.05, 0.6));
  ctx.translate(W - 70, 430); ctx.rotate(lerp(0.25, 0, np)); ctx.scale(lerp(1.8, 1, np), lerp(1.8, 1, np));
  ctx.font = HEAD(250); ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'; ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,255,255,.7)';
  ctx.globalAlpha = np; ctx.strokeText(String(i + 1).padStart(2, '0'), 0, 0);
  ctx.globalAlpha = np * 0.25; ctx.fillStyle = color; ctx.fillText(String(i + 1).padStart(2, '0'), 8, 8);
  ctx.restore();
  // headline block position (bottom-anchored so short and long titles both look right)
  const bottom = H - 300;
  const blockH = L.lines.length * L.lh;
  const top = bottom - blockH - 120;
  // tag pill: bounce in, emoji spin
  {
    const p = seg(t, 0.15, 0.6); const b = oback(p);
    const place = s.location?.places?.find((x) => x !== 'DuPage County');
    const text = `${tag}${place ? ` · ${place.toUpperCase()}` : ''}`;
    ctx.save(); ctx.font = BODY(44); const tw = ctx.measureText(text).width; const pw = tw + 150;
    ctx.translate(60, top - 130); ctx.scale(b, b); ctx.globalAlpha = clamp(p * 3);
    ctx.fillStyle = color; if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(0, 0, pw, 88, 16); ctx.fill(); } else ctx.fillRect(0, 0, pw, 88);
    ctx.save(); ctx.translate(52, 44); ctx.rotate(lerp(-Math.PI, 0, oc(p)) + Math.sin(t * 6) * 0.08); ctx.font = '50px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ico, 0, 2); ctx.restore();
    ctx.fillStyle = color === LIME || color === '#ffb020' ? '#0b1100' : '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(text, 100, 47);
    ctx.restore();
  }
  // kinetic headline: every word pops in on its own, lined up from one layout
  ctx.save(); ctx.font = HEAD(L.fs); ctx.textBaseline = 'alphabetic';
  const exit = seg(t, dur - 0.32, dur);
  L.words.forEach((wd, k) => {
    const p = seg(t, 0.4 + k * 0.055, 0.85 + k * 0.055); if (p <= 0) return;
    const b = oback(p);
    const x = 60 + wd.x, yBase = top + wd.li * L.lh + L.fs * 0.9;
    ctx.save();
    ctx.translate(x + wd.width / 2, yBase - L.fs * 0.4);
    ctx.rotate(lerp((k % 2 ? 1 : -1) * 0.18, 0, oc(p)));
    const sc = lerp(0.4, 1, b) * (1 + exit * 0.5) * (1 + Math.max(0, Math.sin((t - 0.4 - k * 0.055) * 8)) * 0.0);
    ctx.scale(sc, sc);
    ctx.translate(0, lerp(90, 0, oc(p)) - exit * 60);
    ctx.globalAlpha = clamp(p * 2.5) * (1 - exit);
    if (wd.hot) { // lime box wipes in behind key words
      const hp = oc(seg(t, 0.75 + k * 0.055, 1.1 + k * 0.055));
      ctx.fillStyle = LIME; ctx.fillRect(-wd.width / 2 - 10, -L.fs * 0.52, (wd.width + 20) * hp, L.fs * 0.98);
      ctx.fillStyle = hp > 0.5 ? '#0b1100' : '#fff';
    } else ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = wd.hot ? 0 : 18; ctx.shadowOffsetY = 6;
    ctx.fillText(wd.w, -wd.width / 2, L.fs * 0.4);
    ctx.restore();
  });
  ctx.restore();
  // underline + source typewriter
  const by = top + blockH + 34;
  ctx.fillStyle = color; ctx.fillRect(60, by, lerp(0, 220, oexp(seg(t, 0.9, 1.4))) * (1 - exit), 12);
  const src = (s.sourceName || '').toUpperCase();
  const chars = Math.floor(src.length * seg(t, 1.1, 1.7));
  ctx.font = BODY(40); ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.textBaseline = 'top'; ctx.globalAlpha = 1 - exit;
  ctx.fillText(src.slice(0, chars) + (chars < src.length && Math.floor(t * 8) % 2 ? '▍' : ''), 60, by + 36);
  ctx.globalAlpha = 1;
  ticker(ctx, t + i * 2, `SMASH NEWS  ✦  ${tag}  ✦  EVERYTHING NEW. EVERY DAY.`, color);
}

function introScene(ctx, t, dur, title, sub, count) {
  ctx.fillStyle = '#07080b'; ctx.fillRect(0, 0, W, H);
  rays(ctx, t, LIME, seg(t, 0.6, 1.0));
  // grid zoom
  ctx.save(); ctx.translate(W / 2, H / 2); const gz = 1 + t * 0.25; ctx.scale(gz, gz);
  ctx.strokeStyle = 'rgba(198,255,61,.09)'; ctx.lineWidth = 2;
  for (let x = -W; x < W; x += 120) { ctx.beginPath(); ctx.moveTo(x, -H); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = -H; y < H; y += 120) { ctx.beginPath(); ctx.moveTo(-W, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.restore();
  // rings
  for (let k = 0; k < 3; k++) { const r = ((t * 900 + k * 400) % 1400); ctx.beginPath(); ctx.arc(W / 2, H / 2 - 40, r, 0, Math.PI * 2); ctx.strokeStyle = `rgba(198,255,61,${0.35 * (1 - r / 1400)})`; ctx.lineWidth = 6; ctx.stroke(); }
  // slabs
  ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-0.2);
  ctx.fillStyle = LIME; ctx.fillRect(lerp(-1900, -950, oexp(seg(t, 0, 0.6))), -170, 1900, 340);
  ctx.fillStyle = '#fff'; ctx.fillRect(lerp(1900, -950, oexp(seg(t, 0.1, 0.7))), 190, 1900, 16);
  ctx.fillStyle = '#ff3d2e'; ctx.fillRect(lerp(-1900, -950, oexp(seg(t, 0.15, 0.75))), -205, 1900, 14);
  // letters drop in one by one
  ctx.font = HEAD(200); ctx.textBaseline = 'middle'; const word = 'SMASH NEWS';
  const full = ctx.measureText(word).width; let idx = 0;
  for (const ch of word) {
    const x = -full / 2 + ctx.measureText(word.slice(0, idx)).width; idx++;
    if (ch === ' ') continue;
    const p = seg(t, 0.45 + idx * 0.045, 0.8 + idx * 0.045);
    ctx.save(); ctx.translate(x, lerp(-500, 6, oback(p))); ctx.rotate(lerp(-0.6, 0, oc(p))); ctx.globalAlpha = clamp(p * 3);
    ctx.fillStyle = '#0b1100'; ctx.fillText(ch, 0, 0); ctx.restore();
  }
  ctx.restore();
  const flash = t > 0.95 && t < 1.35 ? 0.8 - (t - 0.95) * 2 : 0;
  if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash})`; ctx.fillRect(0, 0, W, H); }
  // title + counter
  const p2 = oback(seg(t, 1.1, 1.5));
  ctx.save(); ctx.translate(W / 2, H / 2 + 360); ctx.scale(p2, p2); ctx.textAlign = 'center';
  ctx.font = HEAD(110); ctx.fillStyle = '#fff'; ctx.fillText(title.replace(/\d+/, String(Math.round(count * oc(seg(t, 1.1, 1.8))))), 0, 0);
  ctx.restore();
  const sp = seg(t, 1.35, 1.9); ctx.textAlign = 'center'; ctx.font = BODY(44); ctx.fillStyle = LIME; ctx.textBaseline = 'middle';
  ctx.fillText(sub.slice(0, Math.floor(sub.length * sp)), W / 2, H / 2 + 470); ctx.textAlign = 'left';
  sparks(ctx, t, LIME, seg(t, 1.0, 1.4));
}

function outroScene(ctx, t, dur) {
  ctx.fillStyle = '#07080b'; ctx.fillRect(0, 0, W, H);
  rays(ctx, t, LIME, 0.9);
  const r = oback(seg(t, 0.05, 0.6));
  ctx.save(); ctx.translate(W / 2, 700); ctx.scale(r, r);
  for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(0, 0, 120 + k * 70 + ((t * 90) % 70), 0, Math.PI * 2); ctx.strokeStyle = `rgba(198,255,61,${0.55 - k * 0.15})`; ctx.lineWidth = 6; ctx.stroke(); }
  ctx.beginPath(); ctx.arc(0, 0, 70, 0, Math.PI * 2); ctx.fillStyle = LIME; ctx.fill();
  ctx.save(); ctx.rotate(t * 3); ctx.fillStyle = 'rgba(11,17,0,.9)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 70, 0, 0.9); ctx.fill(); ctx.restore();
  ctx.restore();
  ctx.font = HEAD(160); ctx.textBaseline = 'alphabetic';
  const word = 'SMASH NEWS'; const full = ctx.measureText(word).width; let idx = 0;
  for (const ch of word) {
    const x = (W - full) / 2 + ctx.measureText(word.slice(0, idx)).width; idx++;
    if (ch === ' ') continue;
    const p = seg(t, 0.3 + idx * 0.04, 0.6 + idx * 0.04);
    ctx.save(); ctx.translate(x, 1120 + lerp(120, 0, oback(p)) + Math.sin(t * 4 + idx) * 6); ctx.globalAlpha = clamp(p * 2);
    ctx.fillStyle = idx <= 5 ? LIME : '#fff'; ctx.fillText(ch, 0, 0); ctx.restore();
  }
  ctx.textAlign = 'center'; ctx.font = BODY(46); ctx.textBaseline = 'middle';
  ctx.globalAlpha = seg(t, 0.8, 1.1); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillText('EVERYTHING NEW. EVERY DAY.', W / 2, 1220);
  ctx.globalAlpha = seg(t, 1.0, 1.3); ctx.fillStyle = LIME; ctx.fillText('FOLLOW FOR MORE', W / 2, 1320);
  ctx.font = '70px sans-serif'; ctx.fillText('👇', W / 2, 1420 + Math.abs(Math.sin(t * 6)) * -24);
  ctx.globalAlpha = 1; ctx.textAlign = 'left';
  sparks(ctx, t, LIME, 1);
  if (t > dur - 0.5) { ctx.fillStyle = `rgba(0,0,0,${seg(t, dur - 0.5, dur)})`; ctx.fillRect(0, 0, W, H); }
}

// transitions: lime wipe / white zoom-flash / glitch slices, rotating per cut
const SNAP = typeof document !== 'undefined' ? document.createElement('canvas') : null;
function transition(ctx, canvas, d, k) {
  const q = (d + 0.22) / 0.44;
  const type = k % 3;
  if (type === 0) {
    ctx.save(); ctx.translate(lerp(-W * 1.3, W * 1.7, q), 0); ctx.transform(1, 0, -0.25, 1, 0, 0);
    ctx.fillStyle = '#0b0f16'; ctx.fillRect(-220, -100, 130, H + 200);
    ctx.fillStyle = LIME; ctx.fillRect(-90, -100, W * 0.75, H + 200); ctx.restore();
  } else if (type === 1) {
    const a = 1 - Math.abs(d) / 0.22;
    ctx.fillStyle = `rgba(255,255,255,${clamp(a) * 0.9})`; ctx.fillRect(0, 0, W, H);
  } else {
    SNAP.width = W; SNAP.height = H; SNAP.getContext('2d').drawImage(canvas, 0, 0);
    const a = 1 - Math.abs(d) / 0.22;
    for (let y = 0; y < H; y += 80) {
      const off = Math.sin(y * 0.37 + d * 90) * 120 * a;
      ctx.drawImage(SNAP, 0, y, W, 80, off, y, W, 80);
    }
    ctx.fillStyle = `rgba(198,255,61,${a * 0.25})`; ctx.fillRect(0, (d * 4000) % H, W, 30);
  }
}

/** Make the reel. Call from a tap (needs a user gesture for audio). Returns { blob, type, seconds }. */
export async function makeReel(stories, { canvas, base = './', title = 'TOP STORIES', onProgress = () => {}, audioCtx } = {}) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const actx = audioCtx || new AC();
  await actx.resume?.();
  onProgress(0, 'Loading pictures…');
  await loadFonts(base);
  try { await document.fonts.ready; } catch {}
  const imgs = await Promise.all(stories.map((s) => loadImg(s.imageUrl)));
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  // lay out every headline once, with the same font used to draw it
  const layouts = stories.map((s) => layoutHeadline(ctx, String(s.title || '').replace(/\s+[-|–—]\s+[^-|–—]{2,40}$/, '').replace(/^(live updates?|watch live|breaking|update|developing)\s*:\s*/i, '').toUpperCase(), W - 120, 5));
  const INTRO = 2.3, OUTRO = 2.8;
  const durs = layouts.map((L) => clamp(2.6 + L.words.length * 0.12, 3.8, 5.6));
  const starts = []; let t = INTRO; for (const d of durs) { starts.push(t); t += d; }
  const total = t + OUTRO;
  const cuts = [INTRO, ...starts.slice(1), t];
  onProgress(0, 'Making the beat…');
  const beat = await makeBeat(total, cuts);
  const day = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase();
  const BEAT = 60 / 124, B0 = 0.9;
  const pulse = (now) => (now < B0 ? 0 : Math.exp(-(((now - B0) % BEAT) / BEAT) * 7));
  const draw = (now) => {
    const pz = pulse(now);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // camera: punch-in on every beat + shake right after each cut
    let shake = 0; for (const c of cuts) { const d = now - c; if (d >= 0 && d < 0.3) shake = (0.3 - d) * 60; }
    const z = 1 + pz * 0.018;
    ctx.setTransform(z, 0, 0, z, (W - W * z) / 2 + Math.sin(now * 97) * shake, (H - H * z) / 2 + Math.cos(now * 71) * shake);
    if (now < INTRO) introScene(ctx, now, INTRO, title, day, stories.length);
    else if (now >= t) outroScene(ctx, now - t, OUTRO);
    else { let i = 0; for (let k = 0; k < starts.length; k++) if (now >= starts[k]) i = k; storyScene(ctx, stories[i], layouts[i], imgs[i], now - starts[i], durs[i], i, stories.length); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    cuts.forEach((c, k) => { if (Math.abs(now - c) < 0.22) transition(ctx, canvas, now - c, k); });
    if (now > INTRO && now < t && pz > 0.55) { ctx.strokeStyle = `rgba(198,255,61,${(pz - 0.55) * 0.9})`; ctx.lineWidth = 16; ctx.strokeRect(8, 8, W - 16, H - 16); }
    grain(ctx, now);
  };
  return recordCanvas(canvas, actx, beat, total, draw, onProgress);
}

async function recordCanvas(canvas, actx, beat, total, draw, onProgress) {
  draw(0);
  // record: canvas video + the beat
  const dest = actx.createMediaStreamDestination();
  const src = actx.createBufferSource(); src.buffer = beat; src.connect(dest);
  const stream = canvas.captureStream(FPS);
  dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
  const types = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const type = types.find((x) => MediaRecorder.isTypeSupported?.(x)) || '';
  const rec = new MediaRecorder(stream, { mimeType: type || undefined, videoBitsPerSecond: 10_000_000, audioBitsPerSecond: 192_000 });
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

// ======================= NFL GAME REEL =======================
function loadLogo(url) {
  return new Promise((res) => {
    if (!url) return res(null);
    const i = new Image(); i.crossOrigin = 'anonymous';
    i.onload = () => res(i); i.onerror = () => res(null);
    i.src = `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=500&h=500&fit=contain&output=png`;
    setTimeout(() => res(null), 8000);
  });
}
const QN = ['', '1ST', '2ND', '3RD', '4TH', 'OT', '2OT'];
function teamBg(ctx, color, t, flip) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, hexA(color, 1)); g.addColorStop(0.6, hexA(color, 0.45)); g.addColorStop(1, '#07080b');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  rays(ctx, t * (flip ? -1 : 1), '#ffffff', 0.6);
}
function bigWord(ctx, word, y, t, color, alt) {
  ctx.save(); ctx.font = HEAD(10); const fs = Math.min(230, Math.floor((W - 100) / (ctx.measureText(word).width / 10)));
  ctx.font = HEAD(fs); ctx.textBaseline = 'alphabetic';
  const full = ctx.measureText(word).width; let idx = 0;
  for (const ch of word) {
    const x = (W - full) / 2 + ctx.measureText(word.slice(0, idx)).width; idx++;
    if (ch === ' ') continue;
    const p = seg(t, 0.05 + idx * 0.035, 0.4 + idx * 0.035);
    ctx.save(); ctx.translate(x, y + lerp(-700, 0, oback(p))); ctx.rotate(lerp((idx % 2 ? 1 : -1) * 0.5, 0, oc(p)));
    ctx.globalAlpha = clamp(p * 3);
    ctx.fillStyle = alt || hexA('#000000', 0.35); ctx.fillText(ch, 10, 10);
    ctx.fillStyle = color; ctx.fillText(ch, 0, 0); ctx.restore();
  }
  ctx.restore();
  return fs;
}
function scoreBar(ctx, g, logos, a, h, flip, t, y) {
  ctx.save(); ctx.fillStyle = 'rgba(5,6,8,.85)';
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(50, y, W - 100, 190, 26); ctx.fill(); } else ctx.fillRect(50, y, W - 100, 190);
  const side = (k, x, val, hot) => {
    if (logos[k]) ctx.drawImage(logos[k], x, y + 35, 120, 120);
    ctx.font = HEAD(56); ctx.fillStyle = '#c9ced6'; ctx.textBaseline = 'middle'; ctx.fillText(g[k].abbr, k === 'away' ? x + 135 : x - 120, y + 97);
    ctx.save(); ctx.translate(k === 'away' ? x + 330 : x - 220, y + 97); const s = hot ? 1 + Math.sin(clamp(hot) * Math.PI) * 0.6 : 1; ctx.scale(s, s);
    ctx.font = HEAD(130); ctx.textAlign = 'center'; ctx.fillStyle = hot > 0.5 ? LIME : '#fff'; ctx.fillText(String(val), 0, 6); ctx.restore();
  };
  const flipP = seg(t, 0.9, 1.3);
  side('away', 80, flip === 'away' && flipP > 0.5 ? a[1] : a[0], flip === 'away' ? flipP : 0);
  side('home', W - 200, flip === 'home' && flipP > 0.5 ? h[1] : h[0], flip === 'home' ? flipP : 0);
  ctx.restore();
}

/** Animated reel for one NFL game (score, quarters, scoring plays, player of the game). */
export async function makeGameReel(game, details, { canvas, base = './', onProgress = () => {}, audioCtx } = {}) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const actx = audioCtx || new AC(); await actx.resume?.();
  onProgress(0, 'Loading team logos…');
  await loadFonts(base); try { await document.fonts.ready; } catch {}
  const logos = { away: await loadLogo(game.away.logo), home: await loadLogo(game.home.logo) };
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const g = game; const winner = Number(g.away.score) > Number(g.home.score) ? 'away' : 'home';
  const color = (k) => g[k].color || (k === 'home' ? '#1f6feb' : '#d93025');
  const plays = (details?.plays || []).slice(-6);
  const leaders = (details?.leaders?.length ? details.leaders : g.leaders || []).slice(0, 3);
  const scenes = [['open', 1.7], ['matchup', 3.4]];
  if ((g.away.linescores || []).length) scenes.push(['box', 2.8]);
  plays.forEach((_, i) => scenes.push([`play${i}`, 2.7]));
  leaders.forEach((_, i) => scenes.push([`leader${i}`, 2.5]));
  scenes.push(['outro', 2.6]);
  let t0 = 0; const timeline = scenes.map(([name, d]) => { const x = { name, start: t0, dur: d }; t0 += d; return x; });
  const total = t0; const cuts = timeline.slice(1).map((x) => x.start);
  onProgress(0, 'Making the beat…');
  const beat = await makeBeat(total, cuts);
  const BEAT = 60 / 124, B0 = 0.9;
  const pulse = (now) => (now < B0 ? 0 : Math.exp(-(((now - B0) % BEAT) / BEAT) * 7));
  const W2 = W / 2;
  const sceneDraw = {
    open(t) {
      ctx.fillStyle = '#07080b'; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.translate(W2, H / 2); ctx.rotate(-0.25);
      const p = oexp(seg(t, 0, 0.5));
      ctx.fillStyle = color('away'); ctx.fillRect(lerp(-2200, -1100, p), -1400, 1100, 2800);
      ctx.fillStyle = color('home'); ctx.fillRect(lerp(1100, 0, p), -1400, 1100, 2800);
      ctx.fillStyle = LIME; ctx.fillRect(-12, -1400, 24 * p, 2800);
      ctx.restore();
      if (t > 0.45) { const q = seg(t, 0.45, 0.75); ctx.save(); ctx.translate(W2, H / 2); const sc = lerp(2.6, 1, oexp(q)); ctx.scale(sc, sc); ctx.rotate(-0.08); ctx.font = HEAD(300); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 40; ctx.fillText('FINAL', 0, 0); ctx.restore(); }
      if (t > 0.5 && t < 0.9) { ctx.fillStyle = `rgba(255,255,255,${0.8 - (t - 0.5) * 2})`; ctx.fillRect(0, 0, W, H); }
      const s = seg(t, 0.9, 1.4); ctx.font = BODY(44); ctx.textAlign = 'center'; ctx.fillStyle = LIME; ctx.globalAlpha = s;
      ctx.fillText(`${g.week ? `WEEK ${g.week} · ` : ''}SMASH NEWS NFL`, W2, H / 2 + 260); ctx.globalAlpha = 1; ctx.textAlign = 'left';
    },
    matchup(t) {
      for (const [k, top, dir] of [['away', 0, -1], ['home', H / 2, 1]]) {
        ctx.save(); ctx.beginPath(); ctx.rect(0, top, W, H / 2); ctx.clip();
        ctx.translate(lerp(dir * W, 0, oexp(seg(t, 0, 0.45))), 0);
        const gr = ctx.createLinearGradient(0, top, W, top + H / 2); gr.addColorStop(0, hexA(color(k), 1)); gr.addColorStop(1, hexA(color(k), 0.35));
        ctx.fillStyle = gr; ctx.fillRect(0, top, W, H / 2); rays(ctx, t * dir, '#fff', 0.35);
        const lp = oback(seg(t, 0.25, 0.8)); const lx = k === 'away' ? 70 : W - 470;
        if (logos[k]) { ctx.save(); ctx.translate(lx + 200, top + 470); ctx.scale(lp, lp); ctx.rotate(Math.sin(t * 2) * 0.03); ctx.drawImage(logos[k], -200, -200, 400, 400); ctx.restore(); }
        ctx.font = HEAD(110); ctx.fillStyle = '#fff'; ctx.textAlign = k === 'away' ? 'right' : 'left'; ctx.textBaseline = 'alphabetic';
        const nx = k === 'away' ? W - 60 : 60;
        ctx.fillText(String(g[k].name || g[k].abbr).toUpperCase(), nx, top + 230);
        const fin = Number(g[k].score) || 0; const c = oc(seg(t, 0.6, 1.8));
        ctx.font = HEAD(300); const lose = k !== winner;
        ctx.globalAlpha = lose ? lerp(1, 0.55, seg(t, 2.0, 2.4)) : 1;
        if (!lose) { ctx.shadowColor = LIME; ctx.shadowBlur = lerp(0, 60, seg(t, 1.8, 2.2)); }
        ctx.fillText(String(Math.round(fin * c)), nx, top + 600);
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        if (g[k].record) { ctx.font = BODY(40); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillText(g[k].record, nx, top + 680); }
        if (!lose) { const w = oback(seg(t, 1.9, 2.3)); if (w > 0) { ctx.save(); ctx.translate(k === 'away' ? W - 470 : 470, top + 440); ctx.rotate(-0.12); ctx.scale(w, w); ctx.fillStyle = LIME; ctx.fillRect(-90, -45, 180, 90); ctx.font = HEAD(64); ctx.fillStyle = '#0b1100'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('WIN', 0, 4); ctx.restore(); } }
        ctx.restore();
      }
      ctx.save(); ctx.translate(W2, H / 2); ctx.rotate(-0.05); ctx.fillStyle = LIME; ctx.fillRect(-W, -40, 2 * W * oexp(seg(t, 0.3, 0.7)), 80);
      ctx.font = HEAD(60); ctx.fillStyle = '#0b1100'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.globalAlpha = seg(t, 0.5, 0.8); ctx.fillText('F I N A L', 0, 4); ctx.restore();
    },
    box(t) {
      teamBg(ctx, color(winner), t, false);
      ctx.fillStyle = 'rgba(7,8,11,.55)'; ctx.fillRect(0, 0, W, H);
      ctx.font = HEAD(120); ctx.fillStyle = '#fff'; ctx.textBaseline = 'alphabetic';
      const tp = oexp(seg(t, 0, 0.4)); ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W * tp, H); ctx.clip(); ctx.fillText('QUARTER BY', 60, 420); ctx.fillText('QUARTER', 60, 540); ctx.restore();
      ctx.fillStyle = LIME; ctx.fillRect(60, 575, 320 * oc(seg(t, 0.2, 0.6)), 14);
      const q = Math.max(g.away.linescores.length, g.home.linescores.length);
      const cw = (W - 340) / (q + 1);
      ctx.font = BODY(40); ctx.fillStyle = '#c9ced6'; ctx.textAlign = 'center';
      for (let i = 0; i < q; i++) ctx.fillText(i < 4 ? `Q${i + 1}` : 'OT', 300 + cw * (i + 0.5), 760);
      ctx.fillText('T', 300 + cw * (q + 0.5), 760);
      ['away', 'home'].forEach((k, r) => {
        const y = 820 + r * 250; const p = oexp(seg(t, 0.25 + r * 0.12, 0.7 + r * 0.12));
        ctx.save(); ctx.translate(lerp(W, 0, p), 0);
        ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(40, y, W - 80, 210); ctx.fillStyle = color(k); ctx.fillRect(40, y, 16, 210);
        if (logos[k]) ctx.drawImage(logos[k], 80, y + 35, 140, 140);
        ctx.font = HEAD(110); ctx.textBaseline = 'middle';
        for (let i = 0; i <= q; i++) {
          const v = i < q ? (g[k].linescores[i] ?? 0) : g[k].score;
          const pp = seg(t, 0.7 + (i * 2 + r) * 0.07, 0.95 + (i * 2 + r) * 0.07);
          ctx.save(); ctx.translate(300 + cw * (i + 0.5), y + 110); const sc = lerp(2, 1, oback(pp)); ctx.scale(sc, sc); ctx.globalAlpha = clamp(pp * 2);
          if (i === q && k === winner) { ctx.fillStyle = LIME; ctx.fillRect(-cw / 2 + 6, -95, cw - 12, 190); ctx.fillStyle = '#0b1100'; } else ctx.fillStyle = '#fff';
          ctx.fillText(String(v), 0, 6); ctx.restore();
        }
        ctx.restore();
      });
      ctx.textAlign = 'left';
    },
    play(t, i) {
      const p = plays[i]; const k = p.team === g.home.abbr ? 'home' : 'away';
      teamBg(ctx, color(k), t, i % 2);
      if (logos[k]) { ctx.save(); ctx.globalAlpha = 0.12; ctx.translate(W2, 900); ctx.rotate(-0.2 + t * 0.03); ctx.drawImage(logos[k], -560, -560, 1120, 1120); ctx.restore(); }
      ctx.font = BODY(44); ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
      const cp = oexp(seg(t, 0, 0.3)); ctx.save(); ctx.translate(0, lerp(-200, 0, cp)); ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(60, 220, 520, 80); ctx.fillStyle = LIME; ctx.fillText(`${QN[p.period] || ''} QTR`, 85, 262); ctx.fillStyle = '#fff'; ctx.fillText(`· ${p.clock || ''} LEFT`, 290, 262); ctx.restore();
      const word = /touchdown/i.test(p.type) || p.abbr === 'TD' ? 'TOUCHDOWN' : /field goal/i.test(p.type) ? 'FIELD GOAL' : /safety/i.test(p.type) ? 'SAFETY' : String(p.type || 'SCORE').toUpperCase();
      bigWord(ctx, word, 640, t, '#fff', hexA('#000000', 0.4));
      ctx.font = BODY(40); ctx.fillStyle = LIME; ctx.globalAlpha = seg(t, 0.5, 0.8); ctx.fillText(`▶ ${String(g[k].full || g[k].name).toUpperCase()}`, 60, 760); ctx.globalAlpha = 1;
      const txt = String(p.text || '').replace(/\s*\((?:[^()]|\([^()]*\))*\)\s*$/, '').replace(/\bYd\b/g, 'YD').toUpperCase();
      const L = layoutHeadline(ctx, txt, W - 120, 4); const fs = Math.min(L.fs, 92); const L2 = fs === L.fs ? L : (ctx.font = HEAD(fs), layoutHeadline(ctx, txt, W - 120, 4));
      ctx.font = HEAD(L2.fs); ctx.textBaseline = 'alphabetic';
      L2.words.forEach((wd, j) => { const q2 = seg(t, 0.55 + j * 0.05, 0.9 + j * 0.05); if (q2 <= 0) return; ctx.save(); ctx.globalAlpha = clamp(q2 * 2.5); ctx.translate(60 + wd.x, 880 + wd.li * L2.lh + L2.fs * 0.9 + lerp(60, 0, oc(q2))); ctx.fillStyle = wd.hot ? LIME : '#fff'; ctx.fillText(wd.w, 0, 0); ctx.restore(); });
      const sb = oexp(seg(t, 0.3, 0.7));
      ctx.save(); ctx.translate(0, lerp(400, 0, sb));
      scoreBar(ctx, g, logos, [p.prevAway ?? 0, p.away], [p.prevHome ?? 0, p.home], k, t, H - 420);
      ctx.restore();
      ctx.font = BODY(34); ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillText(`SCORING PLAY ${i + 1} / ${plays.length}`, W2, H - 170); ctx.textAlign = 'left';
    },
    leader(t, i) {
      const l = leaders[i];
      teamBg(ctx, color(winner), t, true);
      ctx.save(); ctx.translate(0, 700); ctx.rotate(-0.12); ctx.fillStyle = LIME; ctx.fillRect(lerp(-W * 1.4, -100, oexp(seg(t, 0, 0.45))), -150, W * 1.4, 360); ctx.restore();
      ctx.font = BODY(46); ctx.fillStyle = '#fff'; ctx.globalAlpha = seg(t, 0, 0.3); ctx.fillText(i === 0 ? 'PLAYER OF THE GAME' : String(l.category || '').toUpperCase(), 60, 330); ctx.globalAlpha = 1;
      const parts = String(l.player).split(' '); const last = (parts.length > 1 ? parts.slice(1).join(' ') : parts[0]).toUpperCase();
      ctx.font = BODY(70); ctx.fillStyle = '#0b1100'; ctx.save(); ctx.translate(lerp(-700, 0, oc(seg(t, 0.15, 0.5))), 0); ctx.fillText(parts.length > 1 ? parts[0].toUpperCase() : '', 70, 560); ctx.restore();
      ctx.save(); ctx.font = HEAD(10); const fs = Math.min(210, Math.floor((W - 140) / (ctx.measureText(last).width / 10))); ctx.font = HEAD(fs);
      ctx.translate(lerp(900, 0, oexp(seg(t, 0.2, 0.6))), 0); ctx.fillStyle = '#0b1100'; ctx.textBaseline = 'alphabetic'; ctx.fillText(last, 60, 600 + fs * 0.85); ctx.restore();
      const stats = []; const v = String(l.value || ''); let m;
      if ((m = v.match(/(\d+)\/(\d+)/))) stats.push([`${m[1]}/${m[2]}`, 'COMP/ATT', null]);
      if ((m = v.match(/(\d+)\s*CAR/i))) stats.push([m[1], 'CARRIES', +m[1]]);
      if ((m = v.match(/(\d+)\s*REC/i))) stats.push([m[1], 'CATCHES', +m[1]]);
      if ((m = v.match(/(-?\d+)\s*YDS/i))) stats.push([m[1], 'YARDS', +m[1]]);
      if ((m = v.match(/(\d+)\s*TD/i))) stats.push([m[1], 'TD', +m[1]]);
      const tw = (W - 120 - (stats.length - 1) * 24) / Math.max(1, stats.length);
      stats.slice(0, 3).forEach(([val, label, n], j) => {
        const p = seg(t, 0.6 + j * 0.15, 0.95 + j * 0.15); if (p <= 0) return;
        const x = 60 + j * (tw + 24), y = 1100;
        ctx.save(); ctx.translate(x + tw / 2, y + 160); ctx.scale(oback(p), oback(p)); ctx.globalAlpha = clamp(p * 2);
        ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(-tw / 2, -160, tw, 320); ctx.fillStyle = LIME; ctx.fillRect(-tw / 2, 150, tw, 10);
        ctx.font = HEAD(120); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(n == null ? val : String(Math.round(n * oc(seg(t, 0.7 + j * 0.15, 1.6 + j * 0.15)))), 0, -20);
        ctx.font = BODY(34); ctx.fillStyle = LIME; ctx.fillText(label, 0, 100); ctx.restore();
      });
    },
    outro(t, _, dur) {
      outroScene(ctx, t, dur);
      ctx.save(); ctx.globalAlpha = seg(t, 0.1, 0.5) * (1 - seg(t, dur - 0.5, dur));
      for (const [k, x] of [['away', 150], ['home', W - 350]]) { if (logos[k]) ctx.drawImage(logos[k], x, 330, 200, 200); ctx.font = HEAD(130); ctx.textAlign = 'center'; ctx.fillStyle = k === winner ? LIME : 'rgba(255,255,255,.6)'; ctx.fillText(String(g[k].score), x + 100, 650); }
      ctx.restore(); ctx.textAlign = 'left';
    },
  };
  const draw = (now) => {
    const pz = pulse(now);
    let sc = timeline[timeline.length - 1]; for (const x of timeline) if (now >= x.start) sc = x;
    let shake = 0; for (const c of cuts) { const d = now - c; if (d >= 0 && d < 0.3) shake = (0.3 - d) * 60; }
    const z = 1 + pz * 0.016;
    ctx.setTransform(z, 0, 0, z, (W - W * z) / 2 + Math.sin(now * 97) * shake, (H - H * z) / 2 + Math.cos(now * 71) * shake);
    const base2 = sc.name.replace(/\d+$/, ''); const idx = +(sc.name.match(/\d+$/) || [0])[0];
    sceneDraw[base2](now - sc.start, idx, sc.dur);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (sc.name !== 'open' && sc.name !== 'outro') { bug(ctx, 1); sparks(ctx, now, LIME, 0.6); }
    cuts.forEach((c, k) => { if (Math.abs(now - c) < 0.22) transition(ctx, canvas, now - c, k); });
    grain(ctx, now);
  };
  return recordCanvas(canvas, actx, beat, total, draw, onProgress);
}
