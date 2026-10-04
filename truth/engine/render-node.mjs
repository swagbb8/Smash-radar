// Engine-side slide rendering: the same layouts the studio uses in the browser, painted with Skia and saved as files.
//   import { renderPost } from './render-node.mjs'      await renderPost(post, { outDir, theme, imageDir })
//   node engine/render-node.mjs <post.json> <outDir> [preset]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { buildDeck, renderSlide, FONT_FILES, SIZE } from '../app/render/index.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fontsReady = false;
export function registerFonts() {
  if (fontsReady) return; fontsReady = true;
  for (const [family, file] of Object.entries(FONT_FILES)) { const p = path.join(ROOT, 'app', 'fonts', file); if (!GlobalFonts.registerFromPath(p, family)) throw new Error('font failed to load: ' + p); }
}

export async function loadImages(post, imageDir) {
  const out = {};
  for (const [i, im] of (post.images || []).entries()) {
    if (!im?.file) continue; const p = path.isAbsolute(im.file) ? im.file : path.join(imageDir || '.', im.file);
    try { out[i] = await loadImage(fs.readFileSync(p)); } catch (e) { /* a missing picture falls back to the light-beam backdrop */ }
  }
  return out;
}

/** Render every slide of a post. → [{ file, role, bytes }] */
export async function renderPost(post, { outDir, theme = {}, imageDir = '.', format = 'png', edits = {}, scale = 1 } = {}) {
  registerFonts(); const env = { createCanvas: (w, h) => createCanvas(w, h), images: await loadImages(post, imageDir) };
  const deck = buildDeck(post, theme, edits); fs.mkdirSync(outDir, { recursive: true }); const files = [];
  for (let i = 0; i < deck.slides.length; i++) {
    const cv = createCanvas(SIZE.w * scale, SIZE.h * scale); const ctx = cv.getContext('2d'); if (scale !== 1) ctx.scale(scale, scale);
    renderSlide(ctx, env, deck, i);
    const buf = format === 'jpg' ? cv.toBuffer('image/jpeg', 90) : cv.toBuffer('image/png'); const file = path.join(outDir, `${String(i + 1).padStart(2, '0')}.${format}`);
    fs.writeFileSync(file, buf); files.push({ file, role: deck.slides[i].role, bytes: buf.length });
  }
  return files;
}

/** One image with every slide side by side (for review). */
export async function contactSheet(post, file, { theme = {}, imageDir = '.', cols = 4, scale = 0.5, edits = {} } = {}) {
  registerFonts(); const env = { createCanvas: (w, h) => createCanvas(w, h), images: await loadImages(post, imageDir) };
  const deck = buildDeck(post, theme, edits); const n = deck.slides.length; const rows = Math.ceil(n / cols); const w = SIZE.w * scale, h = SIZE.h * scale, gap = 12;
  const sheet = createCanvas(cols * w + (cols + 1) * gap, rows * h + (rows + 1) * gap); const sx = sheet.getContext('2d'); sx.fillStyle = '#3a3a3a'; sx.fillRect(0, 0, sheet.width, sheet.height);
  for (let i = 0; i < n; i++) { const cv = createCanvas(SIZE.w, SIZE.h); renderSlide(cv.getContext('2d'), env, deck, i); sx.drawImage(cv, gap + (i % cols) * (w + gap), gap + Math.floor(i / cols) * (h + gap), w, h); }
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, sheet.toBuffer('image/jpeg', 88)); return file;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [, , postFile, outDir = 'out', preset = 'dossier'] = process.argv;
  const post = JSON.parse(fs.readFileSync(postFile, 'utf8'));
  const files = await renderPost(post, { outDir, theme: { preset }, imageDir: path.dirname(postFile) });
  await contactSheet(post, path.join(outDir, 'sheet.jpg'), { theme: { preset }, imageDir: path.dirname(postFile) });
  console.log(files.map((f) => `${path.basename(f.file)} ${f.role} ${(f.bytes / 1024) | 0}kB`).join('\n'));
}
