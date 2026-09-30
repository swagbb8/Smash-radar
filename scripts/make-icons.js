// Renders public/icons/icon.svg into the PNG sizes iOS/Android need. Uses Playwright's Chromium.
//   npm i -D playwright  &&  node scripts/make-icons.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import('playwright');
const svg = fs.readFileSync(path.join(ROOT, 'public/icons/icon.svg'), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
const out = [['apple-touch-icon.png', 180, 0], ['icon-192.png', 192, 0], ['icon-512.png', 512, 0], ['maskable-512.png', 512, 0.12]];
for (const [name, size, pad] of out) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * (1 - pad * 2));
  await page.setContent(`<html><body style="margin:0;background:#050607;display:grid;place-items:center;width:${size}px;height:${size}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</body></html>`);
  await page.screenshot({ path: path.join(ROOT, 'public/icons', name), omitBackground: false });
  console.log('wrote', name);
}
await browser.close();
