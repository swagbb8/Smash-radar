// Text setting on a canvas: smart punctuation, wrapping, balancing, fitting to a box, tracked small caps.

export function smart(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim()
    .replace(/(^|[\s(\[{"“‘])'(?=\S)/g, '$1‘').replace(/'/g, '’')
    .replace(/(^|[\s(\[{‘])"(?=\S)/g, '$1“').replace(/"/g, '”')
    .replace(/\s--\s|\s-\s/g, ' — ').replace(/\.\.\./g, '…').replace(/(\d)\s?-\s?(\d)/g, '$1–$2').replace(/ (\S{1,3})$/, ' $1');
}

export function measure(ctx, font, text, track = 0, size = 0) { ctx.font = font; return ctx.measureText(text).width + (track ? track * size * Math.max(0, [...text].length - 1) : 0); }

function greedy(ctx, font, words, maxW, track, size) {
  const lines = []; let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (line && measure(ctx, font, t, track, size) > maxW) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line); return lines;
}

/** Wrap, then narrow the measure as far as possible without adding a line — evens out the rag and kills widows. */
export function wrap(ctx, font, text, maxW, { track = 0, size = 0, balance = true } = {}) {
  const words = String(text).split(' ').filter(Boolean); if (!words.length) return [];
  let lines = greedy(ctx, font, words, maxW, track, size);
  if (balance && lines.length > 1) {
    let lo = maxW * 0.45, hi = maxW;
    for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; const l = greedy(ctx, font, words, mid, track, size); if (l.length <= lines.length && Math.max(...l.map((x) => measure(ctx, font, x, track, size))) <= maxW) { hi = mid; lines = l; } else lo = mid; }
  }
  return lines.map((l) => l.replace(/ /g, ' '));
}

/** Largest size in [min,max] at which the text fits maxW × maxH (and maxLines). → { size, lines, lh, height, width } */
export function fit(ctx, family, text, { maxW, maxH, min = 40, max = 160, lh = 1.08, maxLines = 99, track = 0, balance = true }) {
  let lo = min, hi = max, best = null;
  const at = (size) => { const font = `${size}px ${family}`; const lines = wrap(ctx, font, text, maxW, { track, size, balance }); const widest = Math.max(0, ...lines.map((l) => measure(ctx, font, l, track, size))); return { size, font, lines, lh: size * lh, height: lines.length * size * lh, width: widest }; };
  for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; const r = at(mid); if (r.height <= maxH && r.lines.length <= maxLines && r.width <= maxW) { best = r; lo = mid; } else hi = mid; }
  return best || at(min);
}

/** Draw lines from a top-left origin; returns the y of the last baseline. */
export function drawLines(ctx, set, x, y, color, { track = 0, align = 'left', width = 0 } = {}) {
  ctx.font = set.font; ctx.fillStyle = color; ctx.textBaseline = 'alphabetic'; let base = y + set.size * 0.82;
  for (const line of set.lines) {
    const w = measure(ctx, set.font, line, track, set.size); const lx = align === 'right' ? x + width - w : align === 'center' ? x + (width - w) / 2 : x;
    if (track) tracked(ctx, line, lx, base, track * set.size); else ctx.fillText(line, lx, base);
    base += set.lh;
  }
  return base - set.lh;
}

export function tracked(ctx, text, x, y, px) { for (const ch of [...text]) { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + px; } return x; }

/** One-line label that shrinks to fit. */
export function label(ctx, family, text, x, y, size, color, { track = 0, maxW = 0, align = 'left' } = {}) {
  let s = size; ctx.font = `${s}px ${family}`;
  if (maxW) while (s > size * 0.55 && measure(ctx, `${s}px ${family}`, text, track, s) > maxW) s -= 1;
  ctx.font = `${s}px ${family}`; ctx.fillStyle = color; ctx.textBaseline = 'alphabetic';
  const w = measure(ctx, ctx.font, text, track, s); const lx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  if (track) tracked(ctx, text, lx, y, track * s); else ctx.fillText(text, lx, y);
  return { w, size: s, x: lx };
}

export function rng(seed) { let a = (typeof seed === 'number' ? seed : [...String(seed)].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261)) >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
