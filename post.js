// SMASH NEWS Post Studio — renders stories into Instagram-ready images (in the browser, no server needed).
// Feed: 1080×1350 (4:5)   Story/Reel cover: 1080×1920 (9:16)
const C = {
  bg: '#050607', panel: '#0f1317', text: '#f2f5f3', text2: '#b9c2bc', text3: '#7c8680',
  lime: '#c6ff3d', red: '#ff3d2e', cyan: '#3de0ff', amber: '#ffb020', orange: '#ff8a3d', green: '#37e39a', purple: '#b98cff', yellow: '#ffd84d',
};
const CAT = {
  dupage: ['📍', 'DuPage', ['#0b2a33', '#061216']], news: ['🌎', 'US & World', ['#1c2230', '#0a0d14']], tech: ['📱', 'Tech', ['#1a1f3a', '#0a0c18']],
  auto: ['🚗', 'Automotive', ['#301a14', '#120a08']], gaming: ['🎮', 'Gaming', ['#261642', '#0d0818']], energy: ['🥤', 'Drinks', ['#243311', '#0c1206']],
  fitness: ['🏋️', 'Fitness', ['#132a24', '#07110e']], food: ['🍔', 'Food', ['#33230d', '#140d04']], clothing: ['👟', 'Clothing & Shoes', ['#2c1628', '#11080f']],
  retail: ['🛍️', 'Retail', ['#132536', '#070e15']], deals: ['💰', 'Deals', ['#0f2e20', '#06120c']], recalls: ['⚠️', 'Recalls', ['#35190c', '#140904']], openings: ['🏪', 'Openings', ['#2e2a0c', '#121004']],
};
const DISPLAY = '"Barlow Condensed", "SF Pro Display", system-ui, sans-serif';
const SANS = '-apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, "Segoe UI", Roboto, sans-serif';

export const FORMATS = { feed: { w: 1080, h: 1350, label: 'Feed 4:5' }, story: { w: 1080, h: 1920, label: 'Story 9:16' } };

let fontsReady = null;
function ensureFonts() {
  fontsReady ||= Promise.all([
    document.fonts?.load(`800 60px ${DISPLAY}`), document.fonts?.load(`700 60px ${DISPLAY}`),
  ].filter(Boolean)).catch(() => {});
  return Promise.race([fontsReady, new Promise((r) => setTimeout(r, 1500))]);
}

// Publisher images don't allow canvas export, so they are fetched through a CORS image proxy.
function proxied(url) {
  try {
    const u = new URL(url, location.href);
    if (u.origin === location.origin) return u.href;
    return `https://wsrv.nl/?url=${encodeURIComponent(u.href.replace(/^http:/, 'https:'))}&w=1200&output=jpg&q=86`;
  } catch { return null; }
}
const imgCache = new Map();
function loadImage(url) {
  if (!url) return Promise.resolve(null);
  if (imgCache.has(url)) return imgCache.get(url);
  const p = new Promise((resolve) => {
    const src = proxied(url);
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const t = setTimeout(() => resolve(null), 9000);
    img.onload = () => { clearTimeout(t); resolve(img.naturalWidth > 50 ? img : null); };
    img.onerror = () => { clearTimeout(t); resolve(null); };
    img.src = src;
  });
  imgCache.set(url, p);
  return p;
}

function statusStyle(s) {
  if (s.tags?.includes('RECALL')) return ['RECALLED', C.orange, '#1a0c03'];
  if (s.status === 'BREAKING') return ['BREAKING', C.red, '#fff'];
  if (s.nws || s.tags?.includes('ALERT')) return ['ALERT', C.red, '#fff'];
  if (s.tags?.includes('DISCONTINUED')) return ['DISCONTINUED', '#ff6b8a', '#1a0409'];
  if (s.tags?.includes('LEAK')) return ['LEAK', C.purple, '#12051f'];
  if (s.tags?.includes('RUMOR')) return ['RUMOR', C.purple, '#12051f'];
  if (s.tags?.includes('LIMITED')) return ['LIMITED', C.yellow, '#1a1400'];
  if (s.tags?.includes('DEAL')) return ['SALE', C.green, '#03140b'];
  if (s.tags?.includes('OPENING')) return ['NOW OPENING', C.yellow, '#1a1400'];
  if (s.tags?.includes('LAUNCH')) return ['NEW DROP', C.lime, '#0b1100'];
  if (s.status === 'UPDATED') return ['UPDATE', C.amber, '#1d1300'];
  return ['NEW', C.lime, '#0b1100'];
}
const accentFor = (s) => (isLocal(s) ? C.cyan : statusStyle(s)[1]);
const isLocal = (s) => s.location && ['confirmed', 'verified'].includes(s.location.status);
const placeOf = (s) => (isLocal(s) ? s.location.places.filter((p) => p !== 'DuPage County')[0] || 'DuPage County' : null);

function wrap(ctx, text, maxW, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width <= maxW || !line) line = test;
    else { lines.push(line); line = words[i]; }
    if (lines.length === maxLines) { line = ''; lines[maxLines - 1] = ellipsize(ctx, `${lines[maxLines - 1]} ${words.slice(i).join(' ')}`, maxW); return lines; }
  }
  if (line) lines.push(line);
  return lines;
}
function ellipsize(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t.replace(/[\s,.;:–-]+$/, '')}…`;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function pill(ctx, x, y, label, bg, fg, size = 34) {
  ctx.font = `800 ${size}px ${DISPLAY}`;
  const padX = size * 0.55;
  const w = ctx.measureText(label).width + padX * 2 + (label === 'BREAKING' ? size * 0.6 : 0);
  const h = size * 1.45;
  ctx.fillStyle = bg;
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  let tx = x + padX;
  if (label === 'BREAKING') { ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(tx + size * 0.18, y + h / 2, size * 0.17, 0, Math.PI * 2); ctx.fill(); tx += size * 0.6; }
  ctx.fillStyle = fg;
  ctx.textBaseline = 'middle';
  ctx.fillText(label, tx, y + h / 2 + 1);
  ctx.textBaseline = 'alphabetic';
  return w;
}
function radarMark(ctx, cx, cy, r) {
  ctx.save();
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, '#16261a'); g.addColorStop(1, '#060806');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(198,255,61,.6)'; ctx.lineWidth = r * 0.07; ctx.stroke();
  ctx.strokeStyle = 'rgba(198,255,61,.35)'; ctx.lineWidth = r * 0.05;
  for (const k of [0.62, 0.32]) { ctx.beginPath(); ctx.arc(cx, cy, r * k, 0, Math.PI * 2); ctx.stroke(); }
  ctx.fillStyle = 'rgba(198,255,61,.45)';
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r * 0.92, -Math.PI / 2, -Math.PI / 6); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = C.lime; ctx.lineWidth = r * 0.1; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(-Math.PI / 6) * r * 0.85, cy + Math.sin(-Math.PI / 6) * r * 0.85); ctx.stroke();
  ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(cx + r * 0.36, cy - r * 0.48, r * 0.12, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function wordmark(ctx, x, y, size) {
  ctx.font = `800 ${size}px ${DISPLAY}`;
  ctx.fillStyle = C.lime; ctx.fillText('SMASH', x, y);
  const w = ctx.measureText('SMASH ').width;
  ctx.fillStyle = C.text; ctx.fillText('NEWS', x + w, y);
  return w + ctx.measureText('NEWS').width;
}
function drawCover(ctx, img, x, y, w, h) {
  const r = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const iw = img.naturalWidth * r;
  const ih = img.naturalHeight * r;
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 3, iw, ih);
}
function artBackground(ctx, s, x, y, w, h) {
  const [glyph, label, [c1, c2]] = CAT[s.category] || CAT.news;
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, c1); g.addColorStop(1, c2);
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 3;
  for (let r = 60; r < 1400; r += 70) { ctx.beginPath(); ctx.arc(x + w * 0.72, y + h * 0.3, r, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
  const icons = { metra: '🚆', missing: '🔎', emergency: '🚨', fire: '🔥', crash: '💥', police: '🚓', flooding: '🌊', weather: '⛈️', trees: '🌳', outage: '🔌', closure: '🚧', construction: '🏗️', traffic: '🚦', school: '🏫', business: '🏪', development: '🏗️', event: '🎉' };
  ctx.font = `${Math.round(h * 0.3)}px ${SANS}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(icons[s.location?.incident?.id] || glyph, x + w / 2, y + h * 0.45);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = `800 ${Math.round(h * 0.12)}px ${DISPLAY}`;
  ctx.fillStyle = 'rgba(255,255,255,.09)';
  ctx.fillText((s.brands?.[0] || placeOf(s) || label).toUpperCase(), x + 56, y + h - 60);
}

const fmtDate = (iso) => new Date(iso || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' });
const fmtTime = (iso) => new Date(iso || Date.now()).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' });

/** Render one story into a canvas. */
export async function renderStoryPost(s, format = 'feed', { slide = null } = {}) {
  await ensureFonts();
  const { w: W, h: H } = FORMATS[format];
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  const story = format === 'story';
  const photoH = Math.round(H * (story ? 0.5 : 0.54));
  const img = await loadImage(s.imageUrl);
  if (img) drawCover(ctx, img, 0, 0, W, photoH + 80);
  else artBackground(ctx, s, 0, 0, W, photoH + 80);
  // fade photo into background
  const fade = ctx.createLinearGradient(0, photoH - 320, 0, photoH + 80);
  fade.addColorStop(0, 'rgba(5,6,7,0)'); fade.addColorStop(0.75, 'rgba(5,6,7,.92)'); fade.addColorStop(1, C.bg);
  ctx.fillStyle = fade; ctx.fillRect(0, photoH - 320, W, 400);
  const topShade = ctx.createLinearGradient(0, 0, 0, 260);
  topShade.addColorStop(0, 'rgba(0,0,0,.55)'); topShade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = topShade; ctx.fillRect(0, 0, W, 260);

  const M = 64;
  const top = story ? 120 : 56;
  // top-left brand, top-right slide counter
  radarMark(ctx, M + 26, top + 26, 26);
  ctx.font = `800 40px ${DISPLAY}`;
  wordmark(ctx, M + 66, top + 40, 40);
  if (slide) {
    ctx.font = `700 34px ${DISPLAY}`;
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.textAlign = 'right'; ctx.fillText(slide, W - M, top + 40); ctx.textAlign = 'left';
  }

  // badges
  let y = photoH - 40;
  const [label, bg, fg] = statusStyle(s);
  let bx = M;
  bx += pill(ctx, bx, y, label, bg, fg, 34) + 14;
  if (isLocal(s) && label !== 'DUPAGE') bx += pill(ctx, bx, y, `📍 ${placeOf(s).toUpperCase()}`, 'rgba(61,224,255,.16)', C.cyan, 34) + 14;
  else if (s.brands?.[0]) bx += pill(ctx, bx, y, s.brands[0].toUpperCase(), 'rgba(255,255,255,.1)', C.text, 34) + 14;
  y += 104;

  // kicker
  const [, catLabel] = CAT[s.category] || CAT.news;
  ctx.font = `700 34px ${DISPLAY}`;
  ctx.fillStyle = accentFor(s);
  const inc = s.location?.incident?.label;
  ctx.fillText(`${(inc || catLabel).toUpperCase()}  ·  ${fmtDate(s.publishedAt || s.discoveredAt).toUpperCase()}`, M, y);
  y += 26;

  // headline (auto-fit)
  const maxW = W - M * 2;
  const footerTop = H - (story ? 230 : 150);
  let size = story ? 88 : 80;
  let lines;
  for (; size >= 46; size -= 4) {
    ctx.font = `800 ${size}px ${SANS}`;
    lines = wrap(ctx, s.title, maxW, story ? 6 : 5);
    const need = lines.length * size * 1.1;
    const ratio = s.recall?.action || s.product ? 0.46 : (story ? 0.62 : 0.6);
    if (need < (footerTop - y) * ratio && !lines[lines.length - 1].endsWith('…')) break;
  }
  ctx.fillStyle = C.text;
  for (const l of lines) { y += size * 1.1; ctx.fillText(l, M, y); }
  y += 30;

  // body: recall → what to do; product → facts; else summary / why it matters
  const room = footerTop - y - 20;
  if (room > 80) {
    if (s.recall?.action) {
      y = drawLabeled(ctx, 'WHAT TO DO', s.recall.action, M, y, maxW, room, C.orange);
    } else if (s.product && Object.values(s.product).some(Boolean)) {
      y = drawFacts(ctx, s.product, M, y, maxW);
      const r2 = footerTop - y - 20;
      if (r2 > 90 && s.summary) y = drawText(ctx, s.summary, M, y + 10, maxW, r2, 34, C.text2);
    } else {
      const body = s.summary || s.whyItMatters;
      y = drawText(ctx, body, M, y, maxW, Math.min(room, story ? 400 : 190), 36, C.text2);
      if (story && s.whyItMatters && footerTop - y > 200) y = drawLabeled(ctx, 'WHY IT MATTERS', s.whyItMatters, M, y + 30, maxW, footerTop - y - 40, C.lime);
    }
  }

  // footer
  ctx.fillStyle = 'rgba(255,255,255,.08)';
  ctx.fillRect(M, footerTop + 30, W - M * 2, 2);
  ctx.font = `700 30px ${DISPLAY}`;
  const tagW = ctx.measureText('EVERYTHING NEW. EVERY DAY.').width;
  ctx.font = `600 30px ${SANS}`;
  ctx.fillStyle = C.text3;
  const src = `Source: ${s.sourceName || s.sourceDomain || ''}`;
  ctx.fillText(ellipsize(ctx, src, W - M * 2 - tagW - 36), M, footerTop + 92);
  ctx.textAlign = 'right';
  ctx.font = `700 30px ${DISPLAY}`;
  ctx.fillStyle = C.text2;
  ctx.fillText('EVERYTHING NEW. EVERY DAY.', W - M, footerTop + 92);
  ctx.textAlign = 'left';
  return cv;
}

function drawText(ctx, text, x, y, maxW, room, size, color) {
  ctx.font = `500 ${size}px ${SANS}`;
  ctx.fillStyle = color;
  const lh = size * 1.38;
  const lines = wrap(ctx, text, maxW, Math.max(1, Math.floor(room / lh)));
  for (const l of lines) { y += lh; ctx.fillText(l, x, y); }
  return y;
}
function drawLabeled(ctx, label, text, x, y, maxW, room, color) {
  ctx.font = `800 30px ${DISPLAY}`;
  ctx.fillStyle = color;
  ctx.fillText(label, x + 28, y + 50);
  ctx.font = `500 34px ${SANS}`;
  const lh = 34 * 1.36;
  const lines = wrap(ctx, text, maxW - 56, Math.max(1, Math.floor((room - 80) / lh)));
  const boxH = 74 + lines.length * lh + 20;
  ctx.save();
  ctx.globalAlpha = 0.12; ctx.fillStyle = color; roundRect(ctx, x, y, maxW, boxH, 22); ctx.fill();
  ctx.globalAlpha = 0.5; ctx.strokeStyle = color; ctx.lineWidth = 2; roundRect(ctx, x, y, maxW, boxH, 22); ctx.stroke();
  ctx.restore();
  ctx.font = `800 30px ${DISPLAY}`; ctx.fillStyle = color; ctx.fillText(label, x + 28, y + 50);
  ctx.font = `500 34px ${SANS}`; ctx.fillStyle = C.text;
  let ty = y + 58;
  for (const l of lines) { ty += lh; ctx.fillText(l, x + 28, ty); }
  return y + boxH;
}
function drawFacts(ctx, p, x, y, maxW) {
  const facts = [['PRICE', p.price], ['AVAILABLE', p.availability], ['RELEASE', p.releaseDate], ['FLAVOR / COLOR', p.variant], ['SIZE', p.size]].filter(([, v]) => v).slice(0, 4);
  let cx = x;
  let cy = y;
  for (const [k, v] of facts) {
    ctx.font = `800 24px ${DISPLAY}`;
    const kw = ctx.measureText(k).width;
    ctx.font = `700 34px ${SANS}`;
    const vv = ellipsize(ctx, v, maxW - 60);
    const w = Math.max(kw, ctx.measureText(vv).width) + 48;
    if (cx + w > x + maxW) { cx = x; cy += 118; }
    ctx.fillStyle = 'rgba(185,140,255,.12)'; roundRect(ctx, cx, cy, w, 104, 18); ctx.fill();
    ctx.font = `800 24px ${DISPLAY}`; ctx.fillStyle = C.purple; ctx.fillText(k, cx + 24, cy + 38);
    ctx.font = `700 34px ${SANS}`; ctx.fillStyle = C.text; ctx.fillText(vv, cx + 24, cy + 82);
    cx += w + 14;
  }
  return cy + 118;
}

/** Carousel cover: "Today's Radar" with numbered headlines. */
export function weekRange() {
  const f = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' });
  const end = new Date();
  return `${f(new Date(end - 6 * 864e5))} – ${f(end)}`;
}
export async function renderRecapCover(stories, format = 'feed', title = "TODAY'S NEWS", subtitle = null) {
  await ensureFonts();
  const { w: W, h: H } = FORMATS[format];
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(W * 0.85, H * 0.1, 0, W * 0.85, H * 0.1, W * 1.2);
  g.addColorStop(0, '#1b2a0c'); g.addColorStop(0.5, '#08100a'); g.addColorStop(1, C.bg);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.strokeStyle = 'rgba(198,255,61,.08)'; ctx.lineWidth = 3;
  for (let r = 80; r < 1500; r += 80) { ctx.beginPath(); ctx.arc(W * 0.85, H * 0.1, r, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
  const M = 72;
  let y = format === 'story' ? 200 : 110;
  radarMark(ctx, M + 44, y + 10, 44);
  wordmark(ctx, M + 110, y + 30, 58);
  y += 170;
  let ts = format === 'story' ? 150 : 128;
  do { ctx.font = `800 ${ts}px ${DISPLAY}`; ts -= 4; } while (ctx.measureText(title).width > W - M * 2 && ts > 50);
  ctx.fillStyle = C.text;
  ctx.fillText(title, M, y);
  y += ts * 0.95;
  ctx.font = `700 44px ${DISPLAY}`;
  ctx.fillStyle = C.lime;
  ctx.fillText((subtitle || new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Chicago' })).toUpperCase(), M, y);
  y += 70;
  const maxW = W - M * 2 - 90;
  for (const [i, s] of stories.slice(0, format === 'story' ? 7 : 5).entries()) {
    ctx.font = `800 64px ${DISPLAY}`;
    ctx.fillStyle = accentFor(s);
    ctx.fillText(String(i + 1), M, y + 60);
    ctx.font = `700 38px ${SANS}`;
    ctx.fillStyle = C.text;
    const lines = wrap(ctx, s.title, maxW, 2);
    let ly = y + 12;
    for (const l of lines) { ly += 48; ctx.fillText(l, M + 90, ly); }
    y = ly + 44;
  }
  const shown = format === 'story' ? 7 : 5;
  if (stories.length > shown) { ctx.font = `700 36px ${DISPLAY}`; ctx.fillStyle = C.lime; ctx.fillText(`+ ${stories.length - shown} MORE INSIDE`, M + 90, Math.min(y + 10, H - 150)); }
  ctx.font = `700 34px ${DISPLAY}`;
  ctx.fillStyle = C.text2;
  ctx.fillText('SWIPE FOR THE DETAILS  →', M, H - 90);
  ctx.textAlign = 'right';
  ctx.fillText(`UPDATED ${fmtTime()}`, W - M, H - 90);
  ctx.textAlign = 'left';
  return cv;
}

export function toBlob(cv) {
  return new Promise((resolve) => cv.toBlob((b) => resolve(b), 'image/jpeg', 0.92));
}

const tagify = (t) => `#${String(t).replace(/[’'&.]/g, '').replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(' ').map((w) => w[0].toUpperCase() + w.slice(1)).join('')}`;
export function captionFor(s) {
  const [label] = statusStyle(s);
  const emoji = { BREAKING: '🚨', RECALLED: '⚠️', SALE: '💰', 'NEW DROP': '🆕', LIMITED: '⏳', DISCONTINUED: '👋', LEAK: '👀', RUMOR: '👀', 'NOW OPENING': '🏪', UPDATE: '🔄', ALERT: '🚨', NEW: '🆕' }[label] || '📡';
  const place = placeOf(s);
  const parts = [`${emoji} ${label}${place ? ` | 📍 ${place}` : ''}`, '', s.title];
  if (s.summary) parts.push('', s.summary);
  if (s.recall?.action) parts.push('', `What to do: ${s.recall.action}`);
  else if (s.whyItMatters) parts.push('', `Why it matters: ${s.whyItMatters}`);
  if (s.product) {
    const f = [s.product.price && `💵 ${s.product.price}`, s.product.availability && `🛒 ${s.product.availability}`, s.product.releaseDate && `📅 ${s.product.releaseDate}`, s.product.variant && `🎨 ${s.product.variant}`].filter(Boolean);
    if (f.length) parts.push('', f.join('\n'));
  }
  if (s.tags?.includes('RUMOR') || s.tags?.includes('LEAK')) parts.push('', '⚠️ Unconfirmed — treat as a rumor until official.');
  parts.push('', `Source: ${s.sourceName}${s.sourceDomain ? ` (${s.sourceDomain})` : ''}`);
  const tags = new Set(['#SmashNews', '#EverythingNew']);
  for (const b of (s.brands || []).slice(0, 3)) tags.add(tagify(b));
  const catTags = { dupage: ['#DuPageCounty', '#Chicagoland'], tech: ['#Tech', '#TechNews'], auto: ['#Cars', '#CarNews'], gaming: ['#Gaming', '#GamingNews'], energy: ['#EnergyDrinks', '#NewFlavor'], fitness: ['#Fitness', '#Supplements'], food: ['#FastFood', '#NewMenuItem'], clothing: ['#Sneakers', '#Fashion'], retail: ['#Retail', '#Shopping'], deals: ['#Deals', '#Sale'], recalls: ['#Recall', '#ConsumerAlert'], openings: ['#GrandOpening', '#NowOpen'], news: ['#News', '#BreakingNews'] }[s.category] || [];
  catTags.forEach((t) => tags.add(t));
  if (place) { tags.add(tagify(place)); tags.add('#DuPageCounty'); }
  if (s.tags?.includes('RECALL')) tags.add('#Recall');
  if (s.tags?.includes('DEAL')) tags.add('#Deals');
  parts.push('', [...tags].slice(0, 12).join(' '));
  return parts.join('\n');
}

export function recapCaption(stories, weekly = false) {
  const date = weekly ? weekRange() : new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Chicago' });
  const lines = [`📡 ${weekly ? "THIS WEEK'S NEWS" : "TODAY'S NEWS"} — ${date}`, '', ...stories.map((s, i) => `${i + 1}. ${s.title}`), '', 'Swipe for the details 👉', '', `Sources: ${[...new Set(stories.map((s) => s.sourceName))].join(', ')}`, '', weekly ? '#SmashNews #EverythingNew #WeeklyRecap #ThisWeek #WhatsNew' : '#SmashNews #EverythingNew #DailyNews #WhatsNew'];
  return lines.join('\n');
}
