// 2D overlay drawn on the output canvas (so it is part of the exported video): original scoreboard, captions,
// big-moment text, title / final cards, transitions, speed lines, vignette.
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const back = (p) => 1 + 2.70158 * Math.pow(p - 1, 3) + 1.70158 * Math.pow(p - 1, 2);
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255)) / 255; };
const HEAD = '"Anton", Impact, "Arial Narrow", sans-serif', BODY = '"Oswald", "Arial Narrow", Arial, sans-serif';
function rr(x, X, Y, W, H, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + W, Y, X + W, Y + H, r); x.arcTo(X + W, Y + H, X, Y + H, r); x.arcTo(X, Y + H, X, Y, r); x.arcTo(X, Y, X + W, Y, r); x.closePath(); }
function fit(x, text, maxW, size, font, weight = '400') { let s = size; do { x.font = `${weight} ${s}px ${font}`; if (x.measureText(text).width <= maxW) break; s -= 2; } while (s > 12); return s; }
function wrap(x, text, maxW) { const out = []; let line = ''; for (const w of String(text).split(/\s+/)) { const t = line ? `${line} ${w}` : w; if (x.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; } if (line) out.push(line); return out; }

export function drawScoreboard(x, W, H, s) {                    // s: {teams:[a,b], score:[a,b], quarter, clock, down, flash}
  const u = Math.min(W, H * 1.2) / 720, w = Math.min(W - 40 * u, 640 * u), X = (W - w) / 2, Y = 26 * u, h = 76 * u, cw = w * 0.36;
  x.save(); x.shadowColor = 'rgba(0,0,0,.45)'; x.shadowBlur = 18 * u; x.shadowOffsetY = 6 * u; rr(x, X, Y, w, h, 18 * u); x.fillStyle = '#0d1118'; x.fill(); x.restore();
  s.teams.forEach((t, i) => {
    const tx = i ? X + w - cw : X; x.save(); rr(x, tx + 5 * u, Y + 5 * u, cw - 10 * u, h - 10 * u, 13 * u); x.clip(); x.fillStyle = t.color; x.fillRect(tx, Y, cw, h);
    x.fillStyle = 'rgba(255,255,255,.14)'; x.beginPath(); x.moveTo(tx + cw * 0.55, Y); x.lineTo(tx + cw, Y); x.lineTo(tx + cw * 0.8, Y + h); x.lineTo(tx + cw * 0.35, Y + h); x.fill();
    if (s.flash === i) { x.fillStyle = `rgba(255,255,255,${0.5 * s.flashK})`; x.fillRect(tx, Y, cw, h); } x.restore();
    const light = lum(t.color) > 0.62; x.fillStyle = light ? '#0d1118' : '#fff'; x.textBaseline = 'middle';
    x.font = `400 ${34 * u}px ${HEAD}`; x.textAlign = i ? 'right' : 'left'; x.fillText(t.abbr, i ? tx + cw - 18 * u : tx + 18 * u, Y + h / 2 + 2 * u);
    x.font = `400 ${50 * u}px ${HEAD}`; x.textAlign = i ? 'left' : 'right'; x.fillText(String(s.score[i]), i ? tx + 20 * u : tx + cw - 20 * u, Y + h / 2 + 3 * u);
  });
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.font = `700 ${24 * u}px ${BODY}`; x.fillText(s.quarter || 'Q1', W / 2, Y + h * 0.36);
  x.fillStyle = '#c6ff3d'; x.font = `700 ${21 * u}px ${BODY}`; x.fillText(s.clock || '', W / 2, Y + h * 0.7);
  if (s.down) { x.font = `700 ${21 * u}px ${BODY}`; const tw = x.measureText(s.down).width + 30 * u; rr(x, (W - tw) / 2, Y + h + 8 * u, tw, 32 * u, 16 * u); x.fillStyle = '#ffd400'; x.fill(); x.fillStyle = '#141000'; x.fillText(s.down, W / 2, Y + h + 25 * u); }
}
export function drawCaption(x, W, H, kicker, text, color, k = 1) {
  if (!text || k <= 0) return; const u = Math.min(W, H * 1.2) / 720, pad = 22 * u, w = Math.min(W - 2 * pad, 680 * u), X = (W - w) / 2;
  x.save(); x.globalAlpha = clamp(k); x.font = `600 ${27 * u}px ${BODY}`; const lines = wrap(x, text, w - 44 * u).slice(0, 3), h = 46 * u + lines.length * 34 * u, Y = H - h - 30 * u;
  rr(x, X, Y, w, h, 16 * u); x.fillStyle = 'rgba(9,12,17,.86)'; x.fill(); x.fillStyle = color || '#c6ff3d'; rr(x, X, Y, 10 * u, h, 5 * u); x.fill();
  x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillStyle = '#c6ff3d'; x.font = `700 ${18 * u}px ${BODY}`; x.fillText(kicker.toUpperCase().split('').join(' '), X + 26 * u, Y + 22 * u);
  x.fillStyle = '#fff'; x.font = `600 ${27 * u}px ${BODY}`; lines.forEach((l, i) => x.fillText(l, X + 26 * u, Y + 54 * u + i * 34 * u)); x.restore();
}
export function drawSlam(x, W, H, text, el, color) {             // big-moment text that punches in
  if (!text || el < 0 || el > 2.3) return; const u = Math.min(W, H * 1.2) / 720, p = clamp(el / 0.32), s = 2.1 - 1.1 * back(p), a = el > 1.9 ? 1 - (el - 1.9) / 0.4 : 1;
  x.save(); x.globalAlpha = clamp(a); x.translate(W / 2, H * (W > H ? 0.3 : 0.24)); x.rotate(-0.06); x.scale(s, s);
  const size = fit(x, text, W * 0.9, 118 * u, HEAD); x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
  x.lineWidth = size * 0.2; x.strokeStyle = '#0b0d12'; x.strokeText(text, 0, 0); x.lineWidth = size * 0.09; x.strokeStyle = color || '#c6ff3d'; x.strokeText(text, 0, 0); x.fillStyle = '#fff'; x.fillText(text, 0, 0); x.restore();
}
export function drawTag(x, W, H, text) { const u = Math.min(W, H * 1.2) / 720; x.save(); x.font = `700 ${20 * u}px ${BODY}`; const w = x.measureText(text).width + 28 * u; rr(x, W - w - 22 * u, 150 * u, w, 34 * u, 8 * u); x.fillStyle = 'rgba(255,61,46,.92)'; x.fill(); x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, W - w / 2 - 22 * u, 168 * u); x.restore(); }
export function drawBrand(x, W, H, text = 'SMASH 3D') { const u = Math.min(W, H * 1.2) / 720; x.save(); x.font = `400 ${22 * u}px ${HEAD}`; x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillStyle = 'rgba(255,255,255,.85)'; x.shadowColor = '#000'; x.shadowBlur = 6; x.fillText(text, 24 * u, 150 * u + 17 * u); x.restore(); }
export function drawCard(x, W, H, { kicker, title, sub, teams, score, k = 1, color = '#c6ff3d' }) {   // title / final cards
  const u = Math.min(W, H * 1.2) / 720; x.save(); x.globalAlpha = clamp(k); const g = x.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, Math.max(W, H) * 0.75); g.addColorStop(0, 'rgba(13,20,32,.72)'); g.addColorStop(1, 'rgba(4,6,10,.96)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.textAlign = 'center'; x.textBaseline = 'middle'; const cy = H * 0.42;
  if (kicker) { x.font = `700 ${26 * u}px ${BODY}`; x.fillStyle = color; x.fillText(kicker.toUpperCase().split('').join('  '), W / 2, cy - 110 * u); }
  const size = fit(x, title, W * 0.88, 104 * u, HEAD); x.fillStyle = '#fff'; x.save(); x.translate(W / 2, cy); x.scale(2 - back(clamp(k)), 2 - back(clamp(k))); x.fillText(title, 0, 0); x.restore();
  if (sub) { x.font = `500 ${27 * u}px ${BODY}`; x.fillStyle = '#c9ced6'; wrap(x, sub, W * 0.8).slice(0, 3).forEach((l, i) => x.fillText(l, W / 2, cy + size * 0.5 + 44 * u + i * 36 * u)); }
  if (teams && score) { const y = cy + size * 0.5 + 190 * u; x.font = `400 ${78 * u}px ${HEAD}`; x.fillStyle = '#fff'; x.fillText(`${teams[0].abbr} ${score[0]} – ${score[1]} ${teams[1].abbr}`, W / 2, y); }
  x.restore();
}
export function drawWipe(x, W, H, k, color = '#c6ff3d') {         // k 0..1: bars sweep across and off
  if (k <= 0 || k >= 1) return; const n = 6, bh = H / n;
  for (let i = 0; i < n; i++) { const kk = clamp(k * 1.5 - i * 0.08), x0 = kk < 0.5 ? 0 : (kk - 0.5) * 2 * W, x1 = kk < 0.5 ? kk * 2 * W : W; x.fillStyle = i % 2 ? '#0b0d12' : color; x.fillRect(x0 - 1, i * bh - 1, x1 - x0 + 2, bh + 2); }
}
export function drawSpeedLines(x, W, H, k, seed) {
  if (k <= 0.02) return; x.save(); x.strokeStyle = `rgba(255,255,255,${0.2 * k})`; x.lineWidth = Math.max(1.5, W / 360);
  for (let i = 0; i < 26; i++) { const a = ((i * 137.5 + seed * 40) % 360) * Math.PI / 180, r0 = Math.max(W, H) * (0.42 + ((i * 7 + seed) % 5) * 0.03), r1 = r0 + Math.max(W, H) * (0.12 + (i % 4) * 0.05);
    x.beginPath(); x.moveTo(W / 2 + Math.cos(a) * r0, H / 2 + Math.sin(a) * r0 * 1.2); x.lineTo(W / 2 + Math.cos(a) * r1, H / 2 + Math.sin(a) * r1 * 1.2); x.stroke(); } x.restore();
}
let _vg = null;
export function drawVignette(x, W, H, flash = 0) {
  if (!_vg || _vg.W !== W || _vg.H !== H) { const g = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.78); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.38)'); _vg = { W, H, g }; }
  x.fillStyle = _vg.g; x.fillRect(0, 0, W, H); if (flash > 0) { x.fillStyle = `rgba(255,255,255,${0.55 * flash})`; x.fillRect(0, 0, W, H); }
}
