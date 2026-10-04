// Draws the app icons (run by hand when the mark changes): node engine/make-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url))); const OUT = path.join(ROOT, 'app', 'icons');
GlobalFonts.registerFromPath(path.join(ROOT, 'app', 'fonts', 'baskervville-latin-700-normal.woff2'), 'Mark');

/** A paper-white T on black, the red thread running through it with one pin. `safe` leaves room for round masks. */
function draw(size, { safe = false } = {}) {
  const c = createCanvas(size, size), x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, size, size);
  const k = safe ? 0.74 : 1; const u = size * k; const ox = (size - u) / 2;
  x.fillStyle = '#f3f1ec'; x.textAlign = 'center'; x.textBaseline = 'alphabetic'; x.font = `${u * 0.86}px Mark`; x.fillText('T', size / 2, ox + u * 0.79);
  const y = ox + u * 0.6; x.strokeStyle = '#d4122a'; x.lineWidth = Math.max(2, u * 0.035); x.beginPath(); x.moveTo(0, y); x.lineTo(size, y); x.stroke();
  x.fillStyle = '#d4122a'; x.beginPath(); x.arc(size / 2, y, u * 0.075, 0, 7); x.fill();
  return c;
}
fs.mkdirSync(OUT, { recursive: true });
for (const [name, size, opt] of [['icon-192.png', 192], ['icon-512.png', 512], ['icon-maskable-512.png', 512, { safe: true }], ['apple-touch-icon.png', 180], ['og.png', 1200]]) fs.writeFileSync(path.join(OUT, name), draw(size, opt).toBuffer('image/png'));
fs.writeFileSync(path.join(OUT, 'favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#000"/><path d="M14 13h36v9h-3c-1-4-3-5-7-5h-3v27c0 3 1 4 5 4v3H22v-3c4 0 5-1 5-4V17h-3c-4 0-6 1-7 5h-3z" fill="#f3f1ec"/><path d="M0 38h64" stroke="#d4122a" stroke-width="2.4"/><circle cx="32" cy="38" r="4.6" fill="#d4122a"/></svg>\n`);
console.log('icons written to', OUT);
