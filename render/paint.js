// Painting primitives: film grain, a single hard light, graded photographs, the red thread, slide chrome.
import { SIZE, EVIDENCE } from './theme.js';
import { rng, label, tracked, measure } from './typeset.js';

const { w: W, h: H, margin: M } = SIZE;
export const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

/** Lazily built noise tile (seeded, so the browser and the engine render the same grain). */
function noiseTile(env) {
  if (env._noise) return env._noise;
  const n = 256, c = env.createCanvas(n, n), x = c.getContext('2d'), img = x.createImageData(n, n), r = rng(90210);
  for (let i = 0; i < n * n; i++) { const v = r(); const g = v > 0.5 ? 255 : 0; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = g; img.data[i * 4 + 3] = Math.floor(Math.abs(v - 0.5) * 2 * r() * 110); }
  x.putImageData(img, 0, 0); env._noise = c; return c;
}

export function grain(ctx, env, amount = 0.5, rect = [0, 0, W, H]) {
  if (amount <= 0) return; const t = noiseTile(env); ctx.save(); ctx.globalAlpha = Math.min(1, amount * 0.32); ctx.beginPath(); ctx.rect(...rect); ctx.clip();
  for (let y = rect[1]; y < rect[1] + rect[3]; y += 256) for (let x = rect[0]; x < rect[0] + rect[2]; x += 256) ctx.drawImage(t, x, y);
  ctx.restore();
}

/** A hard light falling into darkness. Painted small and scaled up, so its edges are soft without any blur filter
 *  (canvas filters do not exist in Safari). Dust is drawn sharp on top. */
export function beam(ctx, env, { x, y, angle, length = 1700, spread = 0.34, strength = 0.5, seed = 1, dust = 70 }) {
  const k = 12, lw = Math.ceil(W / k), lh = Math.ceil(H / k); const off = env.createCanvas(lw, lh); const o = off.getContext('2d');
  o.translate(x / k, y / k); o.rotate(angle); const n = 5, L = length / k;
  for (let i = 0; i < n; i++) {
    const half = spread * (0.35 + 0.65 * (i / (n - 1))); const g = o.createLinearGradient(0, 0, L, 0); const a = (strength * 0.3) / (1 + i * 0.7);
    g.addColorStop(0, `rgba(255,252,244,${a})`); g.addColorStop(0.5, `rgba(255,252,244,${a * 0.32})`); g.addColorStop(1, 'rgba(255,252,244,0)');
    o.fillStyle = g; o.beginPath(); o.moveTo(0, 0); o.lineTo(L, -Math.tan(half) * L); o.lineTo(L, Math.tan(half) * L); o.closePath(); o.fill();
  }
  ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(off, 0, 0, lw, lh, 0, 0, lw * k, lh * k);
  ctx.translate(x, y); ctx.rotate(angle); const r = rng(seed);
  for (let i = 0; i < dust; i++) { const d = 120 + r() * length * 0.62, a = (r() - 0.5) * 2 * spread * 0.8; ctx.fillStyle = `rgba(255,250,240,${0.04 + r() * 0.22 * strength})`; ctx.beginPath(); ctx.arc(d, Math.tan(a) * d, 0.8 + r() * 2.2, 0, 7); ctx.fill(); }
  ctx.restore();
}

export function vignette(ctx, strength = 0.6, rect = [0, 0, W, H]) {
  const [x, y, w, h] = rect; const g = ctx.createRadialGradient(x + w / 2, y + h * 0.45, Math.min(w, h) * 0.25, x + w / 2, y + h / 2, Math.hypot(w, h) * 0.62);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${strength})`); ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
}

/** Photograph, cropped to fill the rect around a focal point, drained of colour and pushed toward black. */
export function photo(ctx, img, rect, { dark = 0.6, focus = [0.5, 0.4] } = {}) {
  const [x, y, w, h] = rect; const iw = img.width, ih = img.height; if (!iw || !ih) return false;
  const s = Math.max(w / iw, h / ih), sw = w / s, sh = h / s, sx = Math.max(0, Math.min(iw - sw, iw * focus[0] - sw / 2)), sy = Math.max(0, Math.min(ih - sh, ih * focus[1] - sh / 2));
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = '#000'; ctx.fillRect(x, y, w, h);          // drain the colour, keep the light
  ctx.globalCompositeOperation = 'overlay'; ctx.fillStyle = 'rgba(40,40,40,0.55)'; ctx.fillRect(x, y, w, h);   // deepen the shadows
  ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = `rgba(0,0,0,${dark * 0.6})`; ctx.fillRect(x, y, w, h);
  ctx.restore(); return true;
}

export function scrim(ctx, y0, y1, a0, a1, x = 0, w = W) { const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, `rgba(0,0,0,${a0})`); g.addColorStop(1, `rgba(0,0,0,${a1})`); ctx.fillStyle = g; ctx.fillRect(x, Math.min(y0, y1), w, Math.abs(y1 - y0)); }

/** The red thread. It crosses every slide at the same height, so it reads as one line while swiping. */
export const THREAD_Y = 1212;
export function thread(ctx, theme, { from = 0, to = W, pins = [] } = {}) {
  if (!theme.thread) return; const c = theme.colors.red;
  ctx.save(); ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(from, THREAD_Y + 2.5); ctx.lineTo(to, THREAD_Y + 2.5); ctx.stroke();
  ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(from, THREAD_Y); ctx.lineTo(to, THREAD_Y); ctx.stroke();
  for (const px of pins) pin(ctx, theme, px, THREAD_Y);
  ctx.restore();
}
export function pin(ctx, theme, x, y, r = 9) {
  ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.arc(x + 1.5, y + 3, r, 0, 7); ctx.fill();
  ctx.fillStyle = theme.colors.red; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.38)'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.32, r * 0.3, 0, 7); ctx.fill(); ctx.restore();
}

/** Wordmark top-left, slide counter bottom-right. */
export function chrome(ctx, theme, { index, count, right = '' }) {
  const P = theme.colors.paper; ctx.textBaseline = 'alphabetic';
  ctx.font = '36px TTCaps700'; ctx.fillStyle = P; tracked(ctx, theme.brand, M, 122, 36 * 0.07);
  if (right) label(ctx, 'TTSerif400i', right, W - M, 122, 30, theme.colors.ash, { align: 'right' });
  label(ctx, 'TTSans500', `${index + 1}/${count}`, W - M, 1276, 28, theme.colors.ash, { align: 'right' });
}

/** Evidence meter: three dots, a level name, and where the claim comes from. Sits on the thread like a pinned tag. */
export function evidenceTag(ctx, theme, level, cite = '', y = 1166) {
  if (!theme.evidenceTags || !level) return; const e = EVIDENCE[level] || EVIDENCE.supported; const P = theme.colors.paper; let x = M;
  if (e.dots) { for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x + 8 + i * 24, y - 10, 7, 0, 7); if (i < e.dots) { ctx.fillStyle = P; ctx.fill(); } else { ctx.strokeStyle = theme.colors.smoke; ctx.lineWidth = 2; ctx.stroke(); } } x += 3 * 24 + 12; }
  ctx.font = '30px TTCaps500'; ctx.fillStyle = P; x = tracked(ctx, e.label, x, y, 30 * 0.06) + 14;
  if (cite) label(ctx, 'TTSerif400i', cite, x, y, 29, theme.colors.ash, { maxW: W - M - x });
}

export function footer(ctx, theme, text, y = 1276) { if (text) label(ctx, 'TTSerif400i', text, M, y, 30, theme.colors.ash, { maxW: W - 2 * M - 110 }); }
