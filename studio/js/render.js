// Browser side of the shared slide renderer: fonts, canvases, pictures, export.
import { buildDeck, renderSlide, FONT_FILES, SIZE } from '../../render/index.js';
import { asset } from './data.js';
import * as db from './db.js';

export { SIZE };
let fonts;
export function fontsReady() {
  if (!fonts) fonts = Promise.all(Object.entries(FONT_FILES).map(async ([family, file]) => { const f = new FontFace(family, `url(${asset('fonts/' + file)})`); await f.load(); document.fonts.add(f); })).catch((e) => console.warn('font load', e));
  return fonts;
}
const env = { createCanvas: (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }, images: {} };
const imgCache = new Map();
function loadImage(src) {
  if (!imgCache.has(src)) imgCache.set(src, new Promise((resolve) => { const im = new Image(); im.decoding = 'async'; im.onload = () => resolve(im); im.onerror = () => resolve(null); im.src = src; }));
  return imgCache.get(src);
}
/** Pictures for a post: the engine's (by index) plus any Ash uploaded on this device (by slot name). */
export async function imagesFor(post, loc = {}) {
  const out = {};
  await Promise.all((post.images || []).map(async (im, i) => { if (im?.file) out[i] = await loadImage(asset(im.file)); }));
  for (const [slot, key] of Object.entries(loc.uploads || {})) { const blob = await db.get(key).catch(() => null); if (blob) { const url = URL.createObjectURL(blob); out['u:' + slot] = await loadImage(url); } }
  return out;
}
export function deckOf(post, theme, loc = {}) {
  const edits = { ...(loc.edits || {}), hook: loc.hook, hookText: loc.hookText, images: { ...(loc.edits?.images || {}) } };
  for (const slot of Object.keys(loc.uploads || {})) edits.images[slot] = 'u:' + slot;
  for (const slot of loc.noImage || []) edits.images[slot] = -1;
  return buildDeck(post, { ...theme, ...(loc.theme || {}) }, edits);
}
export function paint(canvas, deck, i, images) {
  if (canvas.width !== SIZE.w) { canvas.width = SIZE.w; canvas.height = SIZE.h; }
  env.images = images || {}; return renderSlide(canvas.getContext('2d'), env, deck, i);
}
export async function slideBlob(deck, i, images, type = 'image/png', quality = 0.92) {
  const c = env.createCanvas(SIZE.w, SIZE.h); paint(c, deck, i, images);
  return new Promise((resolve) => c.toBlob(resolve, type, quality));
}
