// Slide layouts, 1080 × 1350. One function per role. Every layout shares the same quiet frame (wordmark, counter,
// the red thread) and lets the type carry the weight.
import { SIZE } from './theme.js';
import { smart, fit, drawLines, label, tracked, wrap } from './typeset.js';
import { grain, beam, vignette, photo, scrim, thread, chrome, evidenceTag, footer, rgba, THREAD_Y, pin } from './paint.js';

const { w: W, h: H, margin: M } = SIZE; const CW = W - 2 * M;
const disp = (theme, text) => (theme.display.caps ? smart(text).toUpperCase() : smart(text));
const BODY = { family: 'TTSerif400', lh: 1.34 };

function backdrop(ctx, env, theme, { base = '#000000', image = null, dark = theme.photo, focus, light = null, rect = [0, 0, W, H], seed = 1 }) {
  ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
  let had = false;
  if (image) had = photo(ctx, image, rect, { dark, focus });
  if (light && theme.light > 0) beam(ctx, env, { ...light, strength: (light.strength ?? 0.5) * theme.light, seed });
  return had;
}
function finish(ctx, env, theme, s, deck, { pins = [], from = 0, to = W, foot = '', right = '' } = {}) {
  grain(ctx, env, theme.grain); thread(ctx, theme, { from, to, pins }); chrome(ctx, theme, { index: s.index, count: deck.slides.length, right }); footer(ctx, theme, foot);
}
/** Draw text blocks top-to-bottom as one group, placed at `bias` (0 top … 1 bottom) of the free space. */
function stack(ctx, theme, parts, top, bottom, bias = 0.5) {
  const total = parts.reduce((n, p) => n + p.set.height + p.gap, 0); let y = top + Math.max(0, bottom - top - total) * bias;
  for (const p of parts) {
    drawLines(ctx, p.set, M + (p.dx || 0), y, p.color, { track: p.track || 0 }); y += p.set.height;
    if (p.rule) { ctx.fillStyle = theme.colors.graphite; ctx.fillRect(M, y + p.gap * 0.5 - 1, 120, 2); }
    if (p.mark) { ctx.fillStyle = theme.colors.red; ctx.fillRect(M, y + p.gap * 0.5 - 2, 64, 3); }
    y += p.gap;
  }
}
function body(ctx, text, x, y, maxW, maxH, color, { max = 46, min = 32 } = {}) {
  const set = fit(ctx, BODY.family, smart(text), { maxW, maxH, min, max, lh: BODY.lh, balance: false }); drawLines(ctx, set, x, y, color); return y + set.height;
}

// ------------------------------------------------------------------------------------------------ cover
export function cover(ctx, env, theme, s, deck) {
  const img = env.images?.[s.image]; const seed = deck.id + 'c';
  const had = backdrop(ctx, env, theme, { image: img, light: img ? null : { x: W * 0.78, y: -160, angle: Math.PI * 0.62, spread: 0.3, strength: 0.95 }, seed });
  if (had) { scrim(ctx, H * 0.2, H * 0.66, 0, 0.86); ctx.fillStyle = 'rgba(0,0,0,0.86)'; ctx.fillRect(0, H * 0.66, W, H * 0.34); scrim(ctx, 0, 260, 0.7, 0); vignette(ctx, 0.5); }
  const d = theme.display; const text = disp(theme, s.hook);
  const set = fit(ctx, d.cover, text, { maxW: CW, maxH: 640, min: 76 * d.scale, max: 172 * d.scale, lh: d.lh, maxLines: 6, track: d.track });
  const top = 1118 - set.height;
  ctx.font = '31px TTCaps500'; ctx.fillStyle = rgba(theme.colors.paper, 0.72); tracked(ctx, deck.series, M, top - 34, 31 * 0.09);
  drawLines(ctx, set, M, top, theme.colors.paper, { track: d.track });
  finish(ctx, env, theme, s, deck, { from: M, pins: [M], foot: `File no. ${deck.fileNo}`, right: theme.swipeHint ? 'swipe' : '' });
}

// ------------------------------------------------------------------------------------------------ reveal (the fact)
export function reveal(ctx, env, theme, s, deck) {
  backdrop(ctx, env, theme, { light: { x: W + 120, y: -120, angle: Math.PI * 0.78, spread: 0.26, strength: 0.5 }, seed: deck.id + 'r' });
  const d = theme.display; const P = theme.colors.paper; const top = 200, bottom = 1100; const parts = [];
  if (s.stat?.value) {
    const st = fit(ctx, d.head, disp(theme, s.stat.value), { maxW: CW, maxH: 330, min: 110, max: 340 * d.scale, lh: 0.92, maxLines: 1, track: -0.01, balance: false });
    parts.push({ set: st, color: P, gap: 22, track: -0.01, dx: -st.size * 0.03 });
    if (s.stat.label) parts.push({ set: fit(ctx, 'TTSans500', smart(s.stat.label), { maxW: CW * 0.9, maxH: 110, min: 30, max: 42, lh: 1.24 }), color: theme.colors.ash, gap: 74, rule: true });
  }
  const used = parts.reduce((n, p) => n + p.set.height + p.gap, 0); const room = bottom - top - used;
  const hd = fit(ctx, d.head, disp(theme, s.headline), { maxW: CW, maxH: room * 0.5, min: 50 * d.scale, max: (s.stat?.value ? 82 : 120) * d.scale, lh: d.lh + 0.04, track: d.track });
  parts.push({ set: hd, color: P, gap: 36, track: d.track });
  parts.push({ set: fit(ctx, BODY.family, smart(s.body), { maxW: CW, maxH: room - hd.height - 36, min: 32, max: s.stat?.value ? 44 : 50, lh: BODY.lh, balance: false }), color: rgba(P, 0.84), gap: 0 });
  stack(ctx, theme, parts, top, bottom, 0.4);
  evidenceTag(ctx, theme, s.evidence?.level, s.evidence?.cite);
  finish(ctx, env, theme, s, deck, { pins: theme.evidenceTags && s.evidence?.level ? [M + 8] : [] });
}

// ------------------------------------------------------------------------------------------------ explain (what is happening)
export function explain(ctx, env, theme, s, deck) {
  backdrop(ctx, env, theme, { base: theme.colors.charcoal }); vignette(ctx, 0.55);
  const d = theme.display; const P = theme.colors.paper; const top = 200, bottom = 1100;
  const hd = fit(ctx, d.head, disp(theme, s.headline), { maxW: CW, maxH: 400, min: 56 * d.scale, max: 128 * d.scale, lh: d.lh + 0.03, track: d.track });
  const bd = fit(ctx, BODY.family, smart(s.body), { maxW: CW, maxH: bottom - top - hd.height - 90, min: 32, max: 52, lh: BODY.lh, balance: false });
  stack(ctx, theme, [{ set: hd, color: P, gap: 90, track: d.track, mark: true }, { set: bd, color: rgba(P, 0.86), gap: 0 }], top, bottom, 0.42);
  evidenceTag(ctx, theme, s.evidence?.level, s.evidence?.cite);
  finish(ctx, env, theme, s, deck, { pins: theme.evidenceTags && s.evidence?.level ? [M + 8] : [] });
}

// ------------------------------------------------------------------------------------------------ matters (why it matters) — the quiet voice
export function matters(ctx, env, theme, s, deck) {
  const img = env.images?.[s.image];
  const had = backdrop(ctx, env, theme, { image: img, dark: Math.min(1, theme.photo + 0.22), light: img ? null : { x: -140, y: 200, angle: Math.PI * 0.2, spread: 0.22, strength: 0.42 }, seed: deck.id + 'm' });
  if (had) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H); vignette(ctx, 0.6); }
  const d = theme.display; const P = theme.colors.paper;
  const hd = fit(ctx, d.quiet, smart(s.headline), { maxW: CW, maxH: 470, min: 60, max: 118, lh: 1.1 });
  const bd = fit(ctx, BODY.family, smart(s.body), { maxW: CW * 0.94, maxH: 330, min: 32, max: 44, lh: BODY.lh, balance: false });
  let y = Math.max(210, 250 + (820 - (hd.height + 50 + bd.height)) * 0.42);
  drawLines(ctx, hd, M, y, P); y += hd.height + 50; drawLines(ctx, bd, M, y, rgba(P, 0.82));
  evidenceTag(ctx, theme, s.evidence?.level || 'interpretation', s.evidence?.cite || '');
  finish(ctx, env, theme, s, deck);
}

// ------------------------------------------------------------------------------------------------ example (a moment you recognise)
export function example(ctx, env, theme, s, deck) {
  const img = env.images?.[s.image]; const P = theme.colors.paper; const d = theme.display; const split = 560;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  if (img) { photo(ctx, img, [0, 0, W, split], { dark: theme.photo * 0.7 }); scrim(ctx, split - 260, split, 0, 1); scrim(ctx, 0, 220, 0.75, 0); }
  else beam(ctx, env, { x: W + 200, y: 380, angle: Math.PI * 0.93, spread: 0.2, strength: 0.5 * theme.light, seed: deck.id + 'e' });
  let y = img ? split + 26 : 430;
  const hd = fit(ctx, d.head, disp(theme, s.headline), { maxW: CW, maxH: 300, min: 50 * d.scale, max: 88 * d.scale, lh: d.lh + 0.04, track: d.track });
  drawLines(ctx, hd, M, y, P, { track: d.track }); y += hd.height + 36;
  body(ctx, s.body, M, y, CW, 1150 - y, rgba(P, 0.86));
  finish(ctx, env, theme, s, deck);
}

// ------------------------------------------------------------------------------------------------ question (the one that stays)
export function question(ctx, env, theme, s, deck) {
  backdrop(ctx, env, theme, { light: { x: W * 0.5, y: -260, angle: Math.PI * 0.5, spread: 0.2, strength: 0.75 }, seed: deck.id + 'q' });
  const P = theme.colors.paper; const d = theme.display;
  const q = fit(ctx, d.quiet, smart(s.headline), { maxW: CW, maxH: 640, min: 70, max: 150, lh: 1.08 });
  const b = s.body ? fit(ctx, 'TTSans400', smart(s.body), { maxW: CW * 0.86, maxH: 150, min: 30, max: 38, lh: 1.3 }) : null;
  let y = 250 + (830 - (q.height + (b ? b.height + 44 : 0))) * 0.5;
  drawLines(ctx, q, M, y, P); y += q.height + 44; if (b) drawLines(ctx, b, M, y, theme.colors.ash);
  finish(ctx, env, theme, s, deck);
}

// ------------------------------------------------------------------------------------------------ sources (the receipts)
export function sources(ctx, env, theme, s, deck) {
  backdrop(ctx, env, theme, { base: theme.colors.charcoal }); vignette(ctx, 0.5);
  const P = theme.colors.paper; const d = theme.display; let y = 250;
  const hd = fit(ctx, d.head, disp(theme, 'Sources'), { maxW: CW, maxH: 110, min: 56, max: 64 * d.scale, lh: 1, maxLines: 1, track: d.track });
  drawLines(ctx, hd, M, y - hd.size * 0.82, P, { track: d.track }); y += 30;
  ctx.fillStyle = theme.colors.graphite; ctx.fillRect(M, y, CW, 2); y += 56;
  const cta = [theme.site ? theme.site.replace(/^https?:\/\//, '').replace(/\/$/, '') : '', theme.handle ? `@${theme.handle.replace(/^@/, '')}` : ''].filter(Boolean);
  const bottom = (cta.length ? 1040 : 1120) - (s.credits ? 40 : 0);
  // measure first, then choose the roomiest setting that fits: two title lines with the journal, down to one line without
  const plan = (n, lines, venue) => { const rows = s.items.slice(0, n).map((it) => { const t = wrap(ctx, '31px TTSerif400', smart(it.title), CW, { balance: false }); const cut = t.slice(0, lines); if (t.length > lines) cut[lines - 1] = cut[lines - 1].replace(/[\s,;:]+\S*$/, '') + '…'; return { it, t: cut, h: 42 + cut.length * 38 + (venue && it.venue ? 34 : 0) }; }); return { rows, venue, total: rows.reduce((a, r) => a + r.h, 0), n }; };
  let best = null; const count = Math.min(6, s.items.length);
  for (const [n, lines, venue] of [[count, 2, true], [count, 2, false], [count, 1, true], [count, 1, false], [5, 1, false], [4, 1, false]]) { const pl = plan(Math.min(n, count), lines, venue); if (!best) best = pl; if (pl.total + (pl.rows.length - 1) * 18 <= bottom - y) { best = pl; break; } best = pl; }
  const gap = Math.max(18, Math.min(44, (bottom - y - best.total) / Math.max(1, best.rows.length)));
  for (const r of best.rows) {
    label(ctx, 'TTSans600', smart(`${r.it.cite}${r.it.kind ? '   ' + r.it.kind : ''}`), M, y, 29, P, { maxW: CW });
    ctx.font = '31px TTSerif400'; ctx.fillStyle = rgba(P, 0.8); r.t.forEach((ln, i) => ctx.fillText(ln, M, y + 40 + i * 38));
    if (best.venue && r.it.venue) label(ctx, 'TTSerif400i', smart(r.it.venue), M, y + 40 + r.t.length * 38 + 2, 27, theme.colors.ash, { maxW: CW });
    y += r.h + gap;
  }
  const more = s.items.length - best.rows.length; if (more > 0) label(ctx, 'TTSerif400i', `and ${more} more in the full file`, M, Math.min(y, bottom + 20), 28, theme.colors.ash);
  if (cta.length) { label(ctx, 'TTSerif400i', 'Every claim, quote and study for this file:', M, 1086, 28, theme.colors.ash, { maxW: CW }); label(ctx, 'TTSans600', cta.join('     '), M, 1132, 34, P, { maxW: CW }); }
  if (s.credits) { const c = wrap(ctx, '22px TTSans400', smart('Images: ' + s.credits), CW, { balance: false }).slice(0, 1); ctx.font = '22px TTSans400'; ctx.fillStyle = theme.colors.smoke; c.forEach((ln, i) => ctx.fillText(ln, M, 1168 + i * 28)); }
  finish(ctx, env, theme, s, deck, { to: W - M, pins: [W - M], foot: `File no. ${deck.fileNo}` });
}

export const LAYOUTS = { cover, reveal, explain, matters, example, question, sources };
