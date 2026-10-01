// SMASH NEWS — client app (no build step). Hash-routed SPA, installable PWA.
const $ = (s, el = document) => el.querySelector(s);
import { makeReel, makeGameReel, reelSupported } from './reel.js';
const lionSVG = () => ''; const LionShow = null; // Smash the lion is retired
const view = $('#view');

// ---------------- local persistence (favorites live on the device) ----------------
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const prefs = {
  brands: new Set(LS.get('sr.brands', [])),
  saved: LS.get('sr.saved', {}),
  dupageInForYou: LS.get('sr.dupageForYou', true),
  nearby: LS.get('sr.nearby', false),
  lionAuto: LS.get('sr.lionAuto', true),
  tvCC: LS.get('sr.tvCC', true),
  customBrands: LS.get('sr.customBrands', []),
  reel: LS.get('sr.reel', []),
  cats: new Set(LS.get('sr.cats', [])),
};
const saveCustom = () => LS.set('sr.customBrands', prefs.customBrands);
const saveCats = () => LS.set('sr.cats', [...prefs.cats]);
const saveBrands = () => LS.set('sr.brands', [...prefs.brands]);
const saveSaved = () => LS.set('sr.saved', prefs.saved);
async function togglePick(id) {
  const i = prefs.reel.findIndex((x) => x.id === id);
  if (i >= 0) prefs.reel.splice(i, 1);
  else {
    if (prefs.reel.length >= 8) return toast('Max 8 stories per reel');
    let s2 = app.stories.get(id) || prefs.saved[id];
    if (!s2) { try { s2 = await api(`/api/stories/${encodeURIComponent(id)}`); app.stories.set(id, s2); } catch { return toast('Couldn\'t add that one'); } }
    prefs.reel.push({ id, title: s2.title, imageUrl: s2.imageUrl, category: s2.category, sourceName: s2.sourceName, tags: s2.tags, status: s2.status, location: s2.location, region: s2.region });
  }
  saveReel();
}
function markPicked() {
  const ids = new Set(prefs.reel.map((x) => x.id));
  document.body.classList.toggle('selecting', !!app.selectMode);
  document.querySelectorAll('#view [data-story]').forEach((el) => {
    el.classList.toggle('picked', ids.has(el.dataset.story));
    const n = prefs.reel.findIndex((x) => x.id === el.dataset.story);
    if (n >= 0) el.dataset.pick = n + 1; else delete el.dataset.pick;
  });
  reelFab();
}
function reelFab() {
  let f = document.getElementById('reelFab');
  if (app.route === 'reels' || app.route === 'story') { f?.remove(); return; }
  if (!f) { f = document.createElement('div'); f.id = 'reelFab'; document.body.append(f); }
  f.className = app.selectMode ? 'reel-fab on' : 'reel-fab';
  f.innerHTML = app.selectMode
    ? `<span><b>${prefs.reel.length}</b> picked</span><button class="btn" data-action="select-off">Done</button><button class="btn primary" data-action="reel-make">🎬 Make reel</button>`
    : `<button class="btn primary" data-action="select-on">🎬 Select for reel${prefs.reel.length ? ` (${prefs.reel.length})` : ''}</button>`;
}
const saveReel = () => { markPicked(); LS.set('sr.reel', prefs.reel); const b = document.querySelector('#reelBar b'); if (b) b.textContent = prefs.reel.length; document.querySelectorAll('[data-reel]').forEach((e) => e.classList.toggle('on', prefs.reel.some((x) => x.id === e.dataset.reel))); };

// ---------------- API ----------------
// Two modes: "server" (Node/Netlify backend at api/*) and "static" (GitHub Pages: pre-built api/*.json
// published by a scheduled GitHub Action — filtering happens here in the browser).
async function api(path, opts = {}) {
  path = path.replace(/^\//, '');
  if (app.mode === 'static') return staticApi(path, opts);
  const res = await fetch(path, { headers: { 'content-type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, data });
  return data;
}

async function detectMode() {
  try {
    const r = await fetch('api/health', { cache: 'no-store' });
    const j = r.ok ? await r.json() : null;
    app.mode = j && j.ok ? 'server' : 'static';
  } catch { app.mode = navigator.onLine ? 'static' : 'server'; }
  if (app.mode === 'server') return;
  try { await (await fetch('api/meta.json')).json(); } catch { app.mode = 'server'; }
}

const STATIC = { data: null };
async function loadStatic(force = false) {
  if (STATIC.data && !force) return STATIC.data;
  const names = ['meta', 'stories', 'dupage', 'brands', 'sources'];
  const bust = force ? `?t=${Date.now()}` : '';
  const [meta, stories, dupage, brands, sources] = await Promise.all(names.map((n) => fetch(`api/${n}.json${bust}`, { cache: force ? 'no-store' : 'default' }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })));
  STATIC.data = { meta, stories: stories.stories, dupage, brands, sources };
  return STATIC.data;
}

const dayKey = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));
function localQuery(all, o) {
  const H = 36e5; const now = Date.now(); const today = dayKey(now);
  const pubMs = (s) => Date.parse(s.publishedAt || s.discoveredAt);
  const brandSet = new Set(String(o.brands || '').split(',').filter(Boolean));
  let list = all.slice();
  const v = o.view || 'home';
  if (v === 'breaking') list = list.filter((s) => s.status === 'BREAKING' || (s.status === 'UPDATED' && now - pubMs(s) < 12 * H));
  if (v === 'today') list = list.filter((s) => dayKey(pubMs(s)) === today || (dayKey(s.discoveredAt) === today && now - pubMs(s) < 36 * H));
  if (v === 'week') list = list.filter((s) => now - pubMs(s) < 7 * 24 * H);
  if (v === 'dupage') list = list.filter((s) => s.location && (o.nearby === '1' || ['confirmed', 'verified'].includes(s.location.status)));
  if (v === 'products') list = list.filter((s) => s.tags.includes('LAUNCH'));
  if (v === 'deals') list = list.filter((s) => s.tags.includes('DEAL'));
  if (v === 'recalls') list = list.filter((s) => s.tags.includes('RECALL'));
  if (v === 'openings') list = list.filter((s) => s.tags.includes('OPENING') || s.tags.includes('CLOSING'));
  const verifiedLocal = (s) => s.location && ['confirmed', 'verified'].includes(s.location.status);
  const RS = ['crash', 'closure', 'construction', 'traffic', 'trees', 'police', 'fire', 'emergency', 'flooding', 'weather', 'outage', 'metra', 'missing'];
  if (v === 'roads') list = list.filter((s) => s.region?.roads || (verifiedLocal(s) && RS.includes(s.location.incident?.id)));
  if (v === 'local') {
    const st = o.state || 'Illinois';
    const co = o.county || '';
    list = list.filter((s) => (co ? (co === 'DuPage' ? verifiedLocal(s) : s.region?.county === co) : (st === 'Illinois' ? s.region?.state === 'Illinois' || !!s.region?.county || verifiedLocal(s) : s.region?.state === st)));
  }
  if (v === 'foryou') list = list.filter((s) => s.brandIds.some((b) => brandSet.has(b)) || (brandSet.has('dupage') && s.location));
  if (o.category) list = list.filter((s) => s.categories.includes(o.category));
  if (brandSet.size && v !== 'foryou') list = list.filter((s) => s.brandIds.some((b) => brandSet.has(b)));
  if (o.place) list = list.filter((s) => s.location?.places?.includes(o.place));
  if (o.incident) list = list.filter((s) => (o.incident === 'local' ? !s.location?.incident : s.location?.incident?.id === o.incident));
  if (o.q) {
    const terms = String(o.q).toLowerCase().split(/\s+/).filter(Boolean);
    list = list.filter((s) => { const hay = `${s.title} ${s.summary} ${s.brands.join(' ')} ${s.sourceName} ${s.location?.places?.join(' ') || ''} ${s.category}`.toLowerCase(); return terms.every((t) => hay.includes(t)); });
  }
  const chrono = ['dupage', 'today', 'week', 'breaking', 'roads', 'local'].includes(v) || o.q;
  list.sort(chrono ? (a, b) => pubMs(b) - pubMs(a) : (a, b) => b.score - a.score);
  const off = Number(o.offset || 0); const lim = Math.min(200, Number(o.limit || 60));
  return { total: list.length, stories: list.slice(off, off + lim) };
}

async function staticApi(path, opts) {
  const method = opts.method || 'GET';
  const [p, query] = path.split('?');
  const params = Object.fromEntries(new URLSearchParams(query || ''));
  if (method === 'POST' && p === 'api/refresh') { const d = await loadStatic(true); return { ok: true, run: { ...(d.meta.latestRun || {}), static: true } }; }
  if (method !== 'GET') throw new Error('Not available in the free hosted version — edit src/config.js in the repo instead');
  const d = await loadStatic();
  if (p === 'api/meta') return { ...d.meta, refreshing: false, mode: 'static' };
  if (p === 'api/briefing' || p === 'api/nfl' || p === 'api/show' || p === 'api/videos' || p === 'api/archive' || p === 'api/recaps' || p === 'api/roadwatch' || p === 'api/roadlive') { const r = await fetch(`${p}.json?t=${Date.now()}`, { cache: 'no-store' }); if (!r.ok) throw new Error('Not ready yet — check back after the next update'); return r.json(); }
  if (p === 'api/dupage') return d.dupage;
  if (p === 'api/brands') return d.brands;
  if (p === 'api/sources') return d.sources;
  if (p === 'api/stories') return localQuery(d.stories, params);
  if (p.startsWith('api/stories/')) { const s = d.stories.find((x) => x.id === decodeURIComponent(p.slice(12))); if (!s) throw new Error('Story not found'); return s; }
  throw new Error(`Unknown path ${p}`);
}
const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && v !== null)).toString();

// ---------------- helpers ----------------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '')) ? String(u).replace(/^http:\/\/(www\.)?bing\.com/i, 'https://www.bing.com') : '#');
const imgUrl = (u) => (/^https?:\/\//i.test(String(u || '')) ? (location.protocol === 'https:' ? String(u).replace(/^http:/i, 'https:') : String(u)) : '');
const TZ = 'America/Chicago';
function ago(iso) {
  if (!iso) return '';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TZ });
}
const fmt = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ }) : '—');
const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ }) : '—');

const CAT = {
  dupage: ['📍', 'DuPage', 'linear-gradient(135deg,#0b2a33,#061216)'],
  news: ['🌎', 'US & World', 'linear-gradient(135deg,#1c2230,#0a0d14)'],
  tech: ['📱', 'Tech', 'linear-gradient(135deg,#1a1f3a,#0a0c18)'],
  auto: ['🚗', 'Automotive', 'linear-gradient(135deg,#301a14,#120a08)'],
  gaming: ['🎮', 'Gaming', 'linear-gradient(135deg,#261642,#0d0818)'],
  energy: ['🥤', 'Drinks', 'linear-gradient(135deg,#243311,#0c1206)'],
  fitness: ['🏋️', 'Fitness', 'linear-gradient(135deg,#132a24,#07110e)'],
  food: ['🍔', 'Food', 'linear-gradient(135deg,#33230d,#140d04)'],
  clothing: ['👟', 'Clothing & Shoes', 'linear-gradient(135deg,#2c1628,#11080f)'],
  retail: ['🛍️', 'Retail', 'linear-gradient(135deg,#132536,#070e15)'],
  deals: ['💰', 'Deals', 'linear-gradient(135deg,#0f2e20,#06120c)'],
  recalls: ['⚠️', 'Recalls', 'linear-gradient(135deg,#35190c,#140904)'],
  openings: ['🏪', 'Openings', 'linear-gradient(135deg,#2e2a0c,#121004)'],
};
const INC_ICON = { metra: '🚆', emergency: '🚨', fire: '🔥', crash: '💥', police: '🚓', flooding: '🌊', weather: '⛈️', outage: '🔌', closure: '🚧', construction: '🏗️', traffic: '🚦', safety: '📢', local: '📰' };

const NAV = [
  { group: 'Radar' },
  { r: 'home', label: 'Home', ic: '🏠' },
  { r: 'reels', label: 'Reel Studio', ic: '🎬' },
  { r: 'daily', label: "Today's News", ic: '📡' },
  { r: 'breaking', label: 'Breaking', ic: '🔥', count: 'BREAKING', hot: true },
  { r: 'today', label: 'Today', ic: '🆕', count: 'NEW' },
  { r: 'week', label: 'This Week', ic: '📅' },
  { r: 'dupage', label: 'DuPage', ic: '📍', count: 'dupage' },
  { r: 'roads', label: 'Roads & Safety', ic: '🚧' },
  { r: 'local', label: 'Local & States', ic: '🗺️' },
  { r: 'nfl', label: 'NFL', ic: '🏈' },
  { group: 'Discover' },
  { r: 'products', label: 'Products', ic: '📦', count: 'products' },
  { r: 'deals', label: 'Deals', ic: '💰', count: 'deals' },
  { r: 'recalls', label: 'Recalls', ic: '⚠️', count: 'recalls' },
  { r: 'openings', label: 'Openings', ic: '🏪' },
  { group: 'You' },
  { r: 'foryou', label: 'For You', ic: '✨' },
  { r: 'posts', label: 'Post Studio', ic: '📸' },
  { r: 'brands', label: 'My Brands', ic: '⭐' },
  { r: 'favorites', label: 'Favorites', ic: '🔖' },
  { r: 'search', label: 'Search', ic: '🔎' },
  { r: 'sources', label: 'Sources', ic: '🩺' },
];
const TITLES = Object.fromEntries(NAV.filter((n) => n.r).map((n) => [n.r, n.label]));
const ICONS = {
  reels: '<svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M3.5 8.5h17M8 3.5l3 5M13.5 3.5l3 5"/><path d="M10 12v5l4.2-2.5z" fill="currentColor"/></svg>',
  lion: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" stroke-dasharray="2.4 1.6"/><circle cx="12" cy="12.5" r="5"/><path d="M10.2 14.2q1.8 1.3 3.6 0"/><circle cx="10.3" cy="11.6" r=".6" fill="currentColor"/><circle cx="13.7" cy="11.6" r=".6" fill="currentColor"/></svg>',
  roads: '<svg viewBox="0 0 24 24"><path d="M8 3 5 21M16 3l3 18M12 4v3M12 10v4M12 17v3"/></svg>',
  nfl: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="9.5" ry="6" transform="rotate(-35 12 12)"/><path d="m9.5 14.5 5-5M10.5 11.2l2.3 2.3M12 9.7l2.3 2.3"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/></svg>',
  breaking: '<svg viewBox="0 0 24 24"><path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5.5 1-8.5Z"/></svg>',
  dupage: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12 18 6"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>',
  foryou: '<svg viewBox="0 0 24 24"><path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7Z"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
};
const STAR = '<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4Z"/></svg>';

// ---------------- app state ----------------
const app = { mode: 'server', meta: null, stories: new Map(), route: 'home', params: {}, refreshing: false, lastSeenRefresh: null, es: null };

// ---------------- rendering bits ----------------
function placeholder(s) {
  const [glyph, label, g] = CAT[s.category] || CAT.news;
  const inc = s.location?.incident?.id;
  return `<div class="ph" style="--g:${g}"><span class="glyph">${inc ? INC_ICON[inc] || glyph : glyph}</span><span class="label">${esc(s.brands?.[0] || label)}</span></div>`;
}
function media(s, eager = false) {
  const src = imgUrl(s.imageUrl);
  return src
    ? `<img src="${esc(src)}" alt="" loading="${eager ? 'eager' : 'lazy'}" decoding="async" referrerpolicy="no-referrer" onload="this.classList.add('loaded')" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'ph-fallback'}));window.__phFix&&window.__phFix()">`
    : placeholder(s);
}
const TAG_LABEL = { DEAL: 'SALE', RECALL: 'RECALLED', LAUNCH: 'PRODUCT', OPENING: 'OPENING', CLOSING: 'CLOSING', ALERT: 'ALERT', LIMITED: 'LIMITED', DISCONTINUED: 'DISCONTINUED', RUMOR: 'RUMOR', LEAK: 'LEAK', TRENDING: 'TRENDING' };
const TAG_ORDER = ['RECALL', 'DISCONTINUED', 'LEAK', 'RUMOR', 'LIMITED', 'DEAL', 'TRENDING', 'LAUNCH', 'OPENING', 'CLOSING', 'ALERT'];
function badges(s, max = 3) {
  const out = [`<span class="badge ${s.status}">${s.status}</span>`];
  if (s.location && ['confirmed', 'verified'].includes(s.location.status)) out.push('<span class="badge t-DUPAGE">DuPage</span>');
  const tags = TAG_ORDER.filter((t) => s.tags.includes(t));
  for (const t of tags.slice(0, Math.max(0, max - out.length + 1))) out.push(`<span class="badge t-${t}">${TAG_LABEL[t] || t}</span>`);
  if (s.official && out.length <= max) out.push('<span class="badge t-OFFICIAL">Official</span>');
  return out.join('');
}
function kicker(s) {
  const [ic, label] = CAT[s.category] || CAT.news;
  const who = s.location && ['confirmed', 'verified'].includes(s.location.status) ? s.location.places.filter((p) => p !== 'DuPage County')[0] || 'DuPage County' : s.brands?.[0];
  return `<div class="kicker">${ic} ${esc(label)}${who ? ` · <b>${esc(who)}</b>` : ''}</div>`;
}
const isSaved = (id) => !!prefs.saved[id];
function card(s, i = 0) {
  app.stories.set(s.id, s);
  const changed = s.changes?.length && s.lastChangedAt && Date.now() - Date.parse(s.lastChangedAt) < 864e5 ? `<div class="changed">↻ What changed: ${esc(describeChange(s.changes[0]))}</div>` : '';
  return `<article class="card" style="animation-delay:${Math.min(i, 10) * 30}ms" data-story="${esc(s.id)}">
    <div class="media" data-cat="${esc(s.category)}">${media(s)}<div class="badges">${badges(s)}</div></div>
    <div class="body">
      ${kicker(s)}
      <h3>${esc(s.title)}</h3>
      ${s.summary ? `<p>${esc(s.summary)}</p>` : ''}
      ${changed}
      <div class="foot"><span class="src">${esc(s.sourceName)}</span><span>·</span><time datetime="${esc(s.publishedAt || s.discoveredAt)}">${ago(s.publishedAt || s.discoveredAt)}</time>
        <button class="save ${isSaved(s.id) ? 'on' : ''}" data-save="${esc(s.id)}" aria-label="Save story">${STAR}</button></div>
    </div></article>`;
}
function row(s, i = 0) {
  app.stories.set(s.id, s);
  const inc = s.location?.incident?.id || 'local';
  const hot = ['BREAKING'].includes(s.status) || ['fire', 'emergency', 'crash'].includes(inc);
  const loc = s.location;
  const v = loc ? `<span class="verify ${loc.status === 'nearby' ? 'nearby' : ''}">${loc.status === 'nearby' ? '≈ Nearby' : '✓'} ${esc(loc.places.filter((p) => p !== 'DuPage County').join(', ') || 'DuPage County')}</span>` : '';
  return `<article class="row" style="animation-delay:${Math.min(i, 10) * 25}ms" data-story="${esc(s.id)}">
    <div class="ico ${hot ? 'hot' : ''}">${INC_ICON[inc] || '📰'}</div>
    <div><div class="meta"><span class="badge ${s.status}">${s.status}</span>${loc?.incident ? `<b>${esc(loc.incident.label)}</b>` : ''}${loc?.roads?.length ? `<span>${esc(loc.roads.join(' · '))}</span>` : ''}</div>
      <h4>${esc(s.title)}</h4>
      <div class="meta">${v}<span>${esc(s.sourceName)}</span><span>${ago(s.publishedAt || s.discoveredAt)}</span></div></div>
    ${s.imageUrl ? `<div class="thumb">${media(s)}</div>` : '<span></span>'}
  </article>`;
}
function describeChange(c) {
  if (!c) return '';
  if (c.title) return 'headline updated';
  if (c.summary) return 'new details added';
  return 'story updated';
}
function hero(s) {
  app.stories.set(s.id, s);
  return `<a class="hero" data-story="${esc(s.id)}" href="#/story/${esc(s.id)}">
    <div class="media">${media(s, true)}</div>
    <div class="body"><div class="badges" style="display:flex;gap:6px;flex-wrap:wrap">${badges(s, 4)}</div>
      <h3>${esc(s.title)}</h3>${s.summary ? `<p>${esc(s.summary)}</p>` : ''}
      <div class="src-line"><b>${esc(s.sourceName)}</b><span>${ago(s.publishedAt || s.discoveredAt)}</span>${s.alsoReportedBy?.length ? `<span>+${s.alsoReportedBy.length} more sources</span>` : ''}</div></div></a>`;
}
function detailRows(rows) {
  return `<dl class="facts">${rows.filter(([, v]) => v).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
}
function productBox(s) {
  const p = s.product || {};
  return `<div class="box prod"><h5>Product tracker</h5>${detailRows([['Brand', s.brands?.[0]], ['Price', p.price], ['Availability', p.availability], ['Release', p.releaseDate], ['Flavor / color', p.variant], ['Size', p.size]])}${s.official ? `<a class="src-link" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">Official page ↗</a>` : ''}</div>`;
}
function recallBox(s) {
  const r = s.recall;
  return `<div class="box recall"><h5>Recall details</h5>${detailRows([['Product', r.product], ['Brand', r.brand], ['Reason', r.reason], ['Affected', r.affected], ['Date', fmt(s.publishedAt || s.discoveredAt)]])}<div class="todo"><b>What to do:</b> ${esc(r.action)}</div></div>`;
}
function productCard(s, i = 0) {
  app.stories.set(s.id, s);
  const p = s.product || {};
  const facts = [['Price', p.price], ['Avail.', p.availability], ['Release', p.releaseDate], ['Variant', p.variant || p.size]].filter(([, v]) => v).slice(0, 3);
  return `<article class="card pcard" style="animation-delay:${Math.min(i, 10) * 30}ms" data-story="${esc(s.id)}">
    <div class="media">${media(s)}<div class="badges">${badges(s, 3)}</div></div>
    <div class="body">${kicker(s)}<h3>${esc(s.title)}</h3>
      ${facts.length ? `<div class="pfacts">${facts.map(([k, v]) => `<span><em>${esc(k)}</em>${esc(v)}</span>`).join('')}</div>` : (s.summary ? `<p>${esc(s.summary)}</p>` : '')}
      <div class="foot"><span class="src">${esc(s.sourceName)}</span><span>·</span><time datetime="${esc(s.publishedAt || s.discoveredAt)}">${ago(s.publishedAt || s.discoveredAt)}</time>
      <button class="save ${isSaved(s.id) ? 'on' : ''}" data-save="${esc(s.id)}" aria-label="Save story">${STAR}</button></div></div></article>`;
}
function recallCard(s, i = 0) {
  app.stories.set(s.id, s);
  const r = s.recall || {};
  return `<article class="card rcard" style="animation-delay:${Math.min(i, 10) * 30}ms" data-story="${esc(s.id)}">
    <div class="body">
      <div class="rhead"><span class="badge t-RECALL">RECALLED</span>${r.official ? '<span class="badge t-OFFICIAL">Official</span>' : ''}<time datetime="${esc(s.publishedAt || s.discoveredAt)}">${ago(s.publishedAt || s.discoveredAt)}</time></div>
      <h3>${esc(r.product || s.title)}</h3>
      ${r.product ? `<div class="muted" style="font-size:13px">${esc(s.title)}</div>` : ''}
      ${detailRows([['Brand', r.brand], ['Reason', r.reason], ['Affected', r.affected]])}
      <div class="todo"><b>What to do:</b> ${esc(r.action)}</div>
      <div class="foot"><span class="src">${esc(s.sourceName)}</span><a class="src-link" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">Official notice ↗</a>
      <button class="save ${isSaved(s.id) ? 'on' : ''}" data-save="${esc(s.id)}" aria-label="Save story">${STAR}</button></div></div></article>`;
}
const skeletons = (n = 6) => `<div class="grid">${Array.from({ length: n }, () => '<div class="skeleton sk-card"></div>').join('')}</div>`;
const empty = (icon, title, text, action = '') => `<div class="empty"><div class="big">${icon}</div><h3>${esc(title)}</h3><p>${text}</p>${action}</div>`;
function noDataYet() {
  const m = app.meta;
  if (m && !m.lastRefreshAt) return empty('📡', 'First sweep hasn\'t finished yet', 'SMASH NEWS is checking its sources for the first time. This usually takes under a minute.', '<button class="btn primary" data-action="refresh" style="max-width:240px;margin:auto">Refresh Now</button>');
  if (m && m.sourceSummary && m.sourceSummary.healthy === 0) return empty('🛰️', 'No sources reachable', 'The last sweep couldn\'t reach any source. Check this server\'s internet connection, then open Sources &amp; Health.', '<a class="btn small" href="#/sources">Open Sources &amp; Health</a>');
  return null;
}
function viewHead(title, sub) { return `<div class="view-head"><h2>${esc(title)}</h2>${sub ? `<p>${sub}</p>` : ''}</div>`; }
function section(title, icon, href, inner) {
  return `<section class="section"><div class="section-head"><h2><span class="ic">${icon}</span>${esc(title)}</h2>${href ? `<a href="${href}">See all →</a>` : ''}</div>${inner}</section>`;
}

// ---------------- views ----------------
const views = {
  async home() {
    const m = app.meta;
    const c = m?.counts || {};
    const top = `<div class="updated">Last updated <b>${m?.lastRefreshAt ? `${esc(clock(m.lastRefreshAt))} · ${ago(m.lastRefreshAt)}` : 'not yet'}</b></div>
      <div class="stats">
      <a class="stat new" href="#/today"><b>${c.NEW ?? '–'}</b><span>New Today</span></a>
      <a class="stat breaking" href="#/breaking"><b>${c.BREAKING ?? '–'}</b><span>Breaking</span></a>
      <a class="stat dupage" href="#/dupage"><b>${c.dupage ?? '–'}</b><span>DuPage</span></a>
      <a class="stat launch" href="#/products"><b>${c.products ?? '–'}</b><span>Products</span></a>
      <a class="stat deal" href="#/deals"><b>${c.deals ?? '–'}</b><span>Deals</span></a>
      <a class="stat recall" href="#/recalls"><b>${c.recalls ?? '–'}</b><span>Recalls</span></a></div>`;
    const banner = `<a class="live-banner reel-banner" href="#/reels"><span class="lb-ic">🎬</span><span><b>Reel Studio</b><br><span class="muted">Pick stories, deals or drops → get an animated reel in seconds</span></span><span class="lb-live" style="background:var(--accent);color:var(--accent-ink);animation:none">NEW</span></a>`;
    const all = await api(`/api/stories?${qs({ view: 'all', limit: 200 })}`);
    if (!all.stories.length) return banner + top + (noDataYet() || empty('📡', 'Radar is clear', 'Nothing collected yet. Tap Refresh to sweep all sources.'));
    const list = all.stories;
    const H = 36e5;
    const pub = (s) => Date.parse(s.publishedAt || s.discoveredAt);
    const today = dayKey(Date.now());
    const heroStory = list.find((s) => s.status === 'BREAKING' && s.imageUrl) || list.find((s) => s.imageUrl) || list[0];
    const sections = [
      ['today', '🆕', 'New Today', '#/today', (s) => s.status === 'NEW' || dayKey(pub(s)) === today],
      ['week', '🔥', 'New This Week', '#/week', (s) => Date.now() - pub(s) < 7 * 24 * H],
      ['breaking', '🚨', 'Breaking', '#/breaking', (s) => s.status === 'BREAKING'],
      ['products', '📦', 'New Products', '#/products', (s) => s.tags.includes('LAUNCH') || s.tags.includes('LIMITED')],
      ['energy', '🥤', 'Drinks', '#/week?category=energy', (s) => s.categories.includes('energy')],
      ['fitness', '🏋️', 'Fitness', '#/week?category=fitness', (s) => s.categories.includes('fitness')],
      ['tech', '📱', 'Technology', '#/week?category=tech', (s) => s.categories.includes('tech')],
      ['auto', '🚗', 'Automotive', '#/week?category=auto', (s) => s.categories.includes('auto')],
      ['gaming', '🎮', 'Gaming', '#/week?category=gaming', (s) => s.categories.includes('gaming')],
      ['food', '🍔', 'Food', '#/week?category=food', (s) => s.categories.includes('food')],
      ['clothing', '👟', 'Clothing & Shoes', '#/week?category=clothing', (s) => s.categories.includes('clothing')],
      ['retail', '🛍️', 'Retail', '#/week?category=retail', (s) => s.categories.includes('retail')],
      ['deals', '💰', 'Deals', '#/deals', (s) => s.tags.includes('DEAL')],
      ['openings', '🏪', 'New Store Openings', '#/openings', (s) => s.tags.includes('OPENING') || s.tags.includes('CLOSING')],
      ['recalls', '🚨', 'Recalls', '#/recalls', (s) => s.tags.includes('RECALL')],
      ['dupage', '📍', 'DuPage County', '#/dupage', (s) => s.location && ['confirmed', 'verified'].includes(s.location.status)],
      ['news', '🌎', 'US / World', '#/week?category=news', (s) => s.category === 'news'],
    ];
    const built = [];
    const shownTimes = new Map();
    for (const [id, ic, label, href, fn] of sections) {
      // keep each rail fresh: skip stories already shown twice above
      const items = list.filter((s) => fn(s) && s.id !== heroStory.id && (shownTimes.get(s.id) || 0) < 2).slice(0, 12);
      if (!items.length) continue;
      items.slice(0, 5).forEach((s) => shownTimes.set(s.id, (shownTimes.get(s.id) || 0) + 1));
      const inner = id === 'dupage' ? `<div class="rows">${items.slice(0, 6).map(row).join('')}</div>` : `<div class="rail">${items.map(card).join('')}</div>`;
      built.push([id, ic, label, `<section class="section" id="sec-${id}"><div class="section-head"><h2><span class="ic">${ic}</span>${esc(label)}</h2><a href="${href}">See all →</a></div>${inner}</section>`]);
    }
    const nav = `<div class="catnav" id="catnav">${built.map(([id, ic, label]) => `<button class="chip" data-jump="sec-${id}">${ic} ${esc(label)}</button>`).join('')}</div>`;
    return banner + top + hero(heroStory) + nav + built.map((b) => b[3]).join('');
  },

  async daily() {
    const all = (await api(`/api/stories?${qs({ view: 'all', limit: 200 })}`)).stories;
    const m = app.meta;
    const today = dayKey(Date.now());
    const fresh = all.filter((s) => dayKey(s.publishedAt || s.discoveredAt) === today || s.status === 'NEW' || s.status === 'BREAKING' || s.status === 'UPDATED');
    const pool = fresh.length >= 10 ? fresh : all;
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: TZ });
    let html = `<div class="daily-head"><div class="kick">Today's News</div><h2>${esc(dateStr)}</h2><p>${(m?.counts?.NEW || 0) + (m?.counts?.BREAKING || 0) + (m?.counts?.UPDATED || 0)} new or updated stories today · updated ${m?.lastRefreshAt ? esc(clock(m.lastRefreshAt)) : '—'}</p></div>`;
    if (!pool.length) return html + (noDataYet() || empty('📡', 'Nothing yet today', 'Check back after the next sweep.'));
    const biggest = pool.slice().sort((a, b) => b.score - a.score).slice(0, 5);
    html += `<section class="section"><div class="section-head"><h2><span class="ic">⭐</span>Biggest New Things</h2></div><div class="grid">${biggest.map(card).join('')}</div></section>`;
    const used = new Set(biggest.map((s) => s.id));
    const groups = [
      ['🥤', 'Drinks', (s) => s.categories.includes('energy'), '#/week?category=energy'],
      ['🏋️', 'Fitness', (s) => s.categories.includes('fitness'), '#/week?category=fitness'],
      ['📱', 'Technology', (s) => s.categories.includes('tech'), '#/week?category=tech'],
      ['🚗', 'Cars', (s) => s.categories.includes('auto'), '#/week?category=auto'],
      ['🍔', 'Food', (s) => s.categories.includes('food'), '#/week?category=food'],
      ['📍', 'DuPage', (s) => s.location && ['confirmed', 'verified'].includes(s.location.status), '#/dupage'],
      ['💰', 'Deals', (s) => s.tags.includes('DEAL'), '#/deals'],
      ['⚠️', 'Recalls', (s) => s.tags.includes('RECALL'), '#/recalls'],
    ];
    for (const [ic, label, fn, href] of groups) {
      const src = pool.filter(fn).length ? pool : all;
      const items = src.filter((s) => fn(s) && !used.has(s.id)).slice(0, 3);
      if (!items.length) continue;
      items.forEach((s) => used.add(s.id));
      html += `<section class="section"><div class="section-head"><h2><span class="ic">${ic}</span>${esc(label)}</h2><a href="${href}">More →</a></div><div class="rows">${items.map(row).join('')}</div></section>`;
    }
    return html;
  },

  breaking: () => listView({ view: 'breaking', title: 'Breaking', sub: 'Fresh, fast-moving stories from the last few hours.', emptyIcon: '🔥', emptyText: 'Nothing breaking right now. That\'s a good thing.' }),
  today: () => listView({ view: 'today', title: 'Today', sub: 'Everything published or discovered today (Central Time).', emptyIcon: '🆕', chips: true }),
  week: () => listView({ view: 'week', title: 'This Week', sub: 'The last 7 days, newest first.', emptyIcon: '📅', chips: true }),
  products: () => listView({ view: 'products', title: 'Product Tracker', sub: 'New products, flavors, drops and releases — with price, availability and release date when the source gives them.', emptyIcon: '📦', chips: true, render: productCard }),
  deals: () => listView({ view: 'deals', title: 'Deals', sub: 'Price drops, sales and promotions worth knowing about.', emptyIcon: '💰', chips: true }),
  recalls: () => listView({ view: 'recalls', title: 'Recalls', sub: 'Vehicle, food, drink, supplement and product recalls — from CPSC, FDA and news coverage. Always confirm on the official notice.', emptyIcon: '⚠️', chips: true, render: recallCard, grid: 'grid recall-grid' }),
  openings: () => listView({ view: 'openings', title: 'Store Openings', sub: 'New locations, grand openings — and closings.', emptyIcon: '🏪', chips: true }),

  async dupage() {
    const p = app.params;
    const [meta, data] = await Promise.all([
      api('/api/dupage'),
      api(`/api/stories?${qs({ view: 'dupage', limit: 150, nearby: prefs.nearby ? '1' : '', incident: p.incident, place: p.place })}`),
    ]);
    const incChips = meta.incidents.filter((i) => i.count > 0);
    const places = meta.places.filter((x) => x.count > 0).sort((a, b) => b.count - a.count);
    const link = (o) => `#/dupage?${qs({ ...p, ...o })}`;
    let html = `<div class="dupage-hero"><div class="rings"></div><h3>DuPage Radar</h3>
      <p>Incidents and local news verified inside DuPage County — crashes, police, fire, closures, construction, outages, flooding, weather and Metra. A highway name alone never counts: every item needs a confirmed DuPage location.</p></div>`;
    html += `<div class="chips"><a class="chip ${!p.incident ? 'on' : ''}" href="${link({ incident: '' })}">All</a>${incChips.map((i) => `<a class="chip ${p.incident === i.id ? 'on' : ''}" href="${link({ incident: i.id })}">${INC_ICON[i.id] || ''} ${esc(i.label)} <span class="n">${i.count}</span></a>`).join('')}</div>`;
    if (places.length) html += `<div class="chips"><a class="chip ${!p.place ? 'on' : ''}" href="${link({ place: '' })}">All towns</a>${places.map((x) => `<a class="chip ${p.place === x.name ? 'on' : ''}" href="${link({ place: x.name })}">${esc(x.name)} <span class="n">${x.count}</span></a>`).join('')}</div>`;
    html += `<div class="toggle" style="margin-bottom:14px"><span>Show <b>nearby</b> stories (towns only partly in DuPage, e.g. Aurora, Bolingbrook) — clearly labeled, not verified</span><button class="switch ${prefs.nearby ? 'on' : ''}" data-action="nearby" aria-label="Toggle nearby"></button></div>`;
    html += data.stories.length ? `<div class="rows">${data.stories.map(row).join('')}</div>` : (noDataYet() || empty('📍', 'All quiet in DuPage', 'No verified DuPage County incidents match this filter right now.'));
    if (meta.rejected?.length) {
      html += `<details class="rejected"><summary>🛡️ Filtered out by the DuPage verifier (${meta.rejected.length} recent)</summary>${meta.rejected.map((r) => `<div class="r"><a href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener">${esc(r.title)}</a><span>${esc(r.reason)}</span></div>`).join('')}</details>`;
    }
    return html;
  },

  async foryou() {
    const ids = [...prefs.brands];
    const custom = prefs.customBrands;
    const cats = [...prefs.cats];
    if (!ids.length && !custom.length && !cats.length && !prefs.dupageInForYou) return viewHead('For You') + empty('✨', 'Pick your brands', 'Star the brands and categories you care about and For You fills up with their launches, deals, recalls and news.', '<a class="btn primary" href="#/brands" style="max-width:220px;margin:auto">Choose brands</a>');
    const all = (await api(`/api/stories?${qs({ view: 'week', limit: 200 })}`)).stories;
    const customRx = custom.map((b) => new RegExp(`\\b${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'));
    const ranked = all.map((s) => {
      const hay = `${s.title} ${s.summary}`;
      let w = 0;
      if (s.brandIds.some((b) => prefs.brands.has(b))) w += 3;
      if (customRx.some((r) => r.test(hay))) w += 3;
      if (s.categories.some((c) => prefs.cats.has(c))) w += 1.5;
      if (prefs.dupageInForYou && s.location && ['confirmed', 'verified'].includes(s.location.status)) w += 2;
      return [s, w];
    }).filter(([, w]) => w > 0).sort((a, b) => b[1] * 40 + b[0].score - (a[1] * 40 + a[0].score)).map(([s]) => s).slice(0, 90);
    const names = await brandNames();
    const chips = `<div class="chips">${ids.map((id) => `<a class="chip star on" href="#/brands">★ ${esc(names[id] || id)}</a>`).join('')}${custom.map((b) => `<a class="chip star on" href="#/brands">★ ${esc(b)}</a>`).join('')}${cats.map((c) => `<a class="chip on" href="#/brands">${CAT[c]?.[0] || ''} ${esc(CAT[c]?.[1] || c)}</a>`).join('')}${prefs.dupageInForYou ? '<a class="chip star on" href="#/brands">📍 DuPage</a>' : ''}<a class="chip" href="#/brands">＋ Edit</a></div>`;
    return viewHead('For You', 'Your brands first, then your categories and your area.') + chips +
      (ranked.length ? `<div class="grid">${ranked.map(card).join('')}</div>` : (noDataYet() || empty('✨', 'Nothing yet for your picks', 'As soon as a source mentions one of your brands it will land here.')));
  },

  async brands() {
    const { brands } = await api('/api/brands');
    const byCat = {};
    for (const b of brands) (byCat[b.category] ||= []).push(b);
    let html = viewHead('My Brands', 'Star brands and categories to build For You. Saved on this iPhone.');
    html += `<div class="box"><h5>Add your own brand</h5><form class="addbrand" id="addBrand"><input name="b" placeholder="e.g. Lucky Charms, Traeger, Stanley" maxlength="40" autocomplete="off"><button class="btn small" type="submit">Add</button></form>
      ${prefs.customBrands.length ? `<div class="chips" style="margin:10px 0 0">${prefs.customBrands.map((b) => `<button class="chip star on" data-rmbrand="${esc(b)}">★ ${esc(b)} ✕</button>`).join('')}</div>` : '<p class="muted" style="margin:8px 0 0;font-size:13px">Custom brands match any story that mentions them.</p>'}</div>`;
    html += `<div class="box"><h5>Favorite categories</h5><div class="chips" style="margin:0">${['energy', 'fitness', 'tech', 'auto', 'gaming', 'food', 'clothing', 'retail', 'deals', 'recalls', 'openings', 'news'].map((c) => `<button class="chip ${prefs.cats.has(c) ? 'on' : ''}" data-cat="${c}">${CAT[c][0]} ${esc(CAT[c][1])}</button>`).join('')}</div></div>`;
    html += `<div class="toggle" style="margin-bottom:8px"><span>📍 Include the <b>DuPage Radar</b> in For You</span><button class="switch ${prefs.dupageInForYou ? 'on' : ''}" data-action="dupage-foryou" aria-label="Toggle DuPage in For You"></button></div>`;
    for (const cat of ['energy', 'fitness', 'food', 'clothing', 'tech', 'auto', 'gaming', 'retail']) {
      if (!byCat[cat]) continue;
      html += section(CAT[cat][1], CAT[cat][0], null, `<div class="brand-grid">${byCat[cat].map((b) => `<button class="brand-tile ${prefs.brands.has(b.id) ? 'on' : ''}" data-brand="${esc(b.id)}"><span>${esc(b.name)}<br><span class="n">${b.count} ${b.count === 1 ? 'story' : 'stories'}</span></span><span class="star">★</span></button>`).join('')}</div>`);
    }
    return html;
  },


  async lion() { location.replace('#/reels'); return ''; },

  async reels() {
    const tab = app.params.t || app.reelTab || 'top';
    app.reelTab = tab;
    const TABS = [['top', '🔥 Top'], ['dupage', '📍 DuPage'], ['roads', '🚧 Roads'], ['products', '📦 New drops'], ['deals', '💰 Deals'], ['recalls', '⚠️ Recalls'], ['today', '🆕 Today'], ['saved', '⭐ Saved']];
    let list = [];
    if (tab === 'saved') list = Object.values(prefs.saved);
    else {
      const q = tab === 'top' ? { view: 'home', limit: 60 } : { view: tab, limit: 60 };
      try { list = (await api(`/api/stories?${qs(q)}`)).stories || []; } catch {}
    }
    list.forEach((x) => app.stories.set(x.id, x));
    let recaps = [];
    try { recaps = (await api('/api/recaps')).recaps || []; } catch {}
    app.recaps = recaps;
    const sel = new Set(prefs.reel.map((x) => x.id));
    const ok = reelSupported();
    return `${viewHead('Reel Studio', 'Tap stories to add them (up to 8), then hit <b>Make reel</b>. You get an animated 9:16 reel with its own beat — ready for Instagram.')}
      ${ok ? '' : '<div class="box alert">This browser can\'t record video. Update iOS / Safari to make reels.</div>'}
      <div class="chips">${TABS.map(([k, l]) => `<a class="chip ${k === tab ? 'on' : ''}" href="#/reels?t=${k}">${l}</a>`).join('')}</div>
      <div class="reel-pick">${list.length ? list.map((x) => `<button class="rp ${sel.has(x.id) ? 'on' : ''}" data-reel="${esc(x.id)}">
        <span class="rp-img">${x.imageUrl ? `<img src="${esc(imgUrl(x.imageUrl))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span>${esc(CAT[x.category]?.[0] || '📰')}</span>`}</span>
        <span class="rp-t"><small>${esc((CAT[x.category]?.[1] || x.category || '').toUpperCase())} · ${esc(x.sourceName || '')}</small>${esc(x.title)}</span><span class="rp-check">✓</span></button>`).join('') : empty('🎬', 'Nothing here yet', 'Try another tab.')}</div>
      ${await gameReelPicker()}
      ${recaps.length ? section('NFL recap videos (with voice-over)', '🎙️', null, `<div class="recaps">${recaps.slice(0, 30).map(recapCard).join('')}</div>`) : ''}
      <div class="reel-bar" id="reelBar"><span><b>${prefs.reel.length}</b> picked</span><button class="btn" data-action="reel-clear">Clear</button><button class="btn primary" data-action="reel-make">🎬 Make reel</button></div>`;
  },

  async nfl() {
    let d;
    try { d = await api('/api/nfl'); } catch (e) { return viewHead('NFL') + empty('🏈', 'NFL data loading', 'Scores, stats and highlights appear after the next update.'); }
    app.nfl = d;
    const live = d.games.filter((g) => g.state === 'in');
    const finals = d.games.filter((g) => g.state === 'post').reverse();
    const upcoming = d.games.filter((g) => g.state === 'pre');
    let html = viewHead('NFL', `${d.week ? `Week ${d.week} · ` : ''}Scores, player stats and highlights for every game. Updated ${ago(d.updatedAt)}.`);
    let recaps = []; try { recaps = (await api('/api/recaps')).recaps || []; } catch {}
    app.recaps = recaps;
    const hlGames = finals.filter((g) => g.clips?.length || g.mainHighlight);
    if (hlGames.length) html += section('Highlight Mode', '⚡', null, `<div class="gr-pick">${hlGames.map((g) => `<button class="gr" data-action="rm-mode" data-id="${esc(g.id)}">${[g.away, g.home].map((x) => `<span class="${x.winner ? 'w' : ''}">${x.logo ? `<img src="${esc(imgUrl(x.logo))}" alt="" referrerpolicy="no-referrer">` : ''}${esc(x.abbr)} <b>${esc(x.score)}</b></span>`).join('')}<em>⚡ ${(g.clips?.length || 0) + (g.mainHighlight ? 1 : 0)} clips</em></button>`).join('')}</div>`);
    if (recaps.length) html += section('SMASH recaps — every game', '🎬', null, `<div class="recaps">${recaps.slice(0, 20).map(recapCard).join('')}</div>`);
    if (live.length) html += section('Live now', '🔴', null, `<div class="games">${live.map(gameCard).join('')}</div>`);
    if (finals.length) html += section('Final scores', '🏁', null, `<div class="games">${finals.map(gameCard).join('')}</div>`);
    if (d.videos.length) html += section('Highlights', '🎬', null, `<div class="rail">${d.videos.slice(0, 24).map(videoCard).join('')}</div>`);
    if (upcoming.length) html += section('Upcoming', '📅', null, `<div class="games">${upcoming.map(gameCard).join('')}</div>`);
    if (d.news.length) html += section('NFL news', '📰', null, `<div class="grid">${d.news.slice(0, 18).map((n) => `<a class="card" href="${esc(safeUrl(n.url))}" target="_blank" rel="noopener"><div class="media">${n.image ? `<img src="${esc(imgUrl(n.image))}" alt="" loading="lazy" referrerpolicy="no-referrer" onload="this.classList.add('loaded')">` : '<div class="ph" style="--g:linear-gradient(135deg,#0b2a1a,#06120c)"><span class="glyph">🏈</span></div>'}</div><div class="body"><div class="kicker">🏈 NFL · ${esc(n.type || 'News')}</div><h3>${esc(n.title)}</h3>${n.summary ? `<p>${esc(n.summary)}</p>` : ''}<div class="foot"><span class="src">ESPN</span><span>·</span><span>${ago(n.published)}</span></div></div></a>`).join('')}</div>`);
    if (!d.games.length && !d.videos.length && !d.news.length) html += empty('🏈', 'No NFL data yet', 'It loads on the next update.');
    return html;
  },

  async roads() {
    const p = app.params;
    const data = await api(`/api/stories?${qs({ view: 'roads', limit: 200 })}`);
    const counties = ['DuPage', 'Cook', 'Kane', 'Will', 'Lake', 'McHenry', 'Kendall', 'DeKalb'];
    const types = [['', 'All'], ['crash', '💥 Crashes'], ['closure', '🚧 Closures'], ['construction', '🏗️ Construction'], ['traffic', '🚦 Traffic'], ['police', '🚓 Police'], ['fire', '🔥 Fire'], ['weather', '⛈️ Weather'], ['outage', '🔌 Outages'], ['metra', '🚆 Metra']];
    const countyOf = (s) => (s.location && ['confirmed', 'verified'].includes(s.location.status) ? 'DuPage' : s.region?.county);
    const incOf = (s) => s.location?.incident?.id || s.region?.incident?.id || '';
    let list = data.stories;
    if (p.county) list = list.filter((s) => countyOf(s) === p.county);
    if (p.type) list = list.filter((s) => incOf(s) === p.type);
    const link = (o) => `#/roads?${qs({ ...p, ...o })}`;
    let html = viewHead('Roads & Safety', 'Crashes, closures, construction, traffic, police and fire across Chicagoland. Every item is tied to a real county or town, never a highway name alone.');
    html += `<button class="btn primary rw-live" data-action="road-map">🗺️ Live road map · closures, construction &amp; crashes in every state</button>`;
    let rw = null; try { rw = await api('/api/roadwatch'); } catch {}
    app.rw = rw;
    if (rw?.video) html += `<div class="rw-box"><div class="rw-head"><b>🗺️ Road Watch video</b><span class="muted">${rw.total} incidents · ${rw.stateCount} states · updated ${esc(clock(rw.videoAt || rw.createdAt))}</span></div>
      <div class="video-wrap tall rw-vid"><video src="${esc(rw.video)}" controls playsinline muted loop preload="metadata" poster=""></video></div>
      <div class="actions"><button class="btn primary" data-action="rw-save">⬇ Save video</button>${(rw.history || []).length > 1 ? `<span class="muted">New one every 10 minutes</span>` : ''}</div></div>`;
    const sv = Object.entries(rw?.stateSlugs || {}).filter(([, sl]) => rw.stateVideos?.[sl]).sort(([a], [b]) => (a === 'Illinois' ? -1 : b === 'Illinois' ? 1 : a.localeCompare(b)));
    if (sv.length) html += `<div class="rw-box"><div class="rw-head"><b>📍 Every state's road video</b><span class="muted">${sv.length} states ready · Illinois refreshes every 10 min, the rest rotate through</span></div>
      <div class="st-vids">${sv.map(([name, sl]) => `<button class="chip" data-action="st-vid" data-st="${esc(name)}">${esc(name)} <small>${esc(ago(rw.stateVideos[sl].at))}</small></button>`).join('')}</div></div>`;
    html += `<div class="chips"><a class="chip ${!p.county ? 'on' : ''}" href="${link({ county: '' })}">All counties</a>${counties.map((c) => `<a class="chip ${p.county === c ? 'on' : ''}" href="${link({ county: c })}">${esc(c)} <span class="n">${data.stories.filter((s) => countyOf(s) === c).length}</span></a>`).join('')}</div>`;
    html += `<div class="chips">${types.map(([id, l]) => `<a class="chip ${(p.type || '') === id ? 'on' : ''}" href="${link({ type: id })}">${l}</a>`).join('')}</div>`;
    html += list.length ? `<div class="rows">${list.map(roadRow).join('')}</div>` : (noDataYet() || empty('🚦', 'All clear', 'No road or safety reports match right now. This page updates every 10 minutes.'));
    return html;
  },

  async local() {
    const p = app.params;
    const state = p.state || 'Illinois';
    const county = state === 'Illinois' ? (p.county || '') : '';
    const data = await api(`/api/stories?${qs({ view: 'local', state, county, limit: 120 })}`);
    let html = viewHead('Local & States', 'News for every Chicagoland county and all 50 states.');
    html += `<div class="local-pick"><label>State <select id="statePick">${STATES.map((st) => `<option ${st === state ? 'selected' : ''}>${esc(st)}</option>`).join('')}</select></label></div>`;
    if (state === 'Illinois') html += `<div class="chips"><a class="chip ${!county ? 'on' : ''}" href="#/local?state=Illinois">All Illinois</a>${['DuPage', 'Cook', 'Kane', 'Will', 'Lake', 'McHenry', 'Kendall', 'DeKalb'].map((c) => `<a class="chip ${county === c ? 'on' : ''}" href="#/local?${qs({ state: 'Illinois', county: c })}">${esc(c)} County</a>`).join('')}</div>`;
    html += data.stories.length ? `<div class="grid">${data.stories.map(card).join('')}</div>` : (noDataYet() || empty('🗺️', `No ${county ? `${county} County` : state} stories yet`, 'State and county news fills in over the next few updates.'));
    return html;
  },

  async shows() {
    let arch = [];
    try { arch = (await api('/api/archive')).shows || []; } catch {}
    const recent = await videosHtml();
    const byDay = {};
    for (const x of arch) (byDay[x.slot.slice(0, 10)] ||= []).push(x);
    const dayLabel = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const t12 = (slot) => { const [h, m] = slot.slice(11, 16).split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
    return `${viewHead('Saved shows', 'Every Smash rundown, saved as a video + script')}
      <h3 class="sec-title">🎬 Latest (watch here)</h3><div class="rows tv-vids">${recent}</div>
      <h3 class="sec-title">🗄️ Every show, saved forever</h3>
      ${arch.length ? Object.entries(byDay).map(([d, list]) => `<details class="arch-day" ${d === Object.keys(byDay)[0] ? 'open' : ''}><summary><b>${esc(dayLabel(d))}</b><span class="muted">${list.length} ${list.length === 1 ? 'show' : 'shows'}</span></summary>
        ${list.map((x) => `<div class="tv-vid"><div class="tv-vid-i">🦁</div><div class="tv-vid-t"><b>${esc(t12(x.slot))}</b><span class="muted">${esc((x.headlines || []).slice(0, 2).join(' · '))}</span></div><a class="chip on" href="${esc(safeUrl(x.video))}" target="_blank" rel="noopener">⬇ Video</a>${x.script ? `<a class="chip" href="${esc(safeUrl(x.script))}" target="_blank" rel="noopener">📄</a>` : ''}</div>`).join('')}</details>`).join('')
        : '<div class="muted tv-vid-empty">The forever archive starts filling up with the next rundown.</div>'}`;
  },

  async posts() {
    const all = (await api(`/api/stories?${qs({ view: 'all', limit: 200 })}`)).stories;
    if (!all.length) return viewHead('Post Studio') + (noDataYet() || empty('📸', 'Nothing to post yet', 'Posts appear after the first sweep.'));
    let html = viewHead('Post Studio', 'Turn any story into an Instagram post. Tap a story → Share → Instagram (or Save to Photos). The caption is copied for you.');
    const ap = app.meta?.autopost;
    html += `<div class="box"><h5>Instagram auto-post</h5>${ap?.last ? `On · ${ap.today} post${ap.today === 1 ? '' : 's'} today · last: ${esc(ap.last.kind === 'recap' ? 'Daily Recap' : 'story')} ${ago(ap.last.at)}` : 'Off — add your Instagram connection in the GitHub repo secrets to turn it on.'}${ap?.lastError ? `<div class="err" style="color:var(--breaking);font-size:12.5px;margin-top:4px">Last error: ${esc(ap.lastError.error)}</div>` : ''}</div>`;
    html += `<button class="recap-card" data-action="recap"><span class="big">📡</span><span><b>Daily Recap carousel</b><br><span class="muted">Cover slide + today's top 5 stories, ready to post as one carousel</span></span><span class="go">Make →</span></button>`;
    html += `<button class="recap-card week" data-action="recap-week"><span class="big">🗓️</span><span><b>Weekly Recap carousel</b><br><span class="muted">This week's biggest story from each category — up to 9 slides + cover</span></span><span class="go">Make →</span></button>`;
    const groups = [
      ['🚨', 'Breaking', (x) => x.status === 'BREAKING'],
      ['📍', 'DuPage', (x) => x.location && ['confirmed', 'verified'].includes(x.location.status)],
      ['📦', 'New Products', (x) => x.tags.includes('LAUNCH') || x.tags.includes('LIMITED')],
      ['💰', 'Deals', (x) => x.tags.includes('DEAL')],
      ['⚠️', 'Recalls', (x) => x.tags.includes('RECALL')],
      ['🔥', 'Trending', (x) => x.tags.includes('TRENDING') || x.alsoReportedBy.length >= 2],
    ];
    for (const [ic, label, fn] of groups) {
      const items = all.filter(fn).slice(0, 6);
      if (!items.length) continue;
      html += section(label, ic, null, `<div class="rows">${items.map((x) => { app.stories.set(x.id, x); return `<div class="row post-row"><div class="thumb">${media(x)}</div><div><div class="meta"><span class="badge ${x.status}">${x.status}</span><span>${esc(x.sourceName)}</span><span>${ago(x.publishedAt || x.discoveredAt)}</span></div><h4>${esc(x.title)}</h4></div><button class="btn small primary-lite" data-post="${esc(x.id)}">📸 Post</button></div>`; }).join('')}</div>`);
    }
    return html;
  },

  async favorites() {
    const list = Object.values(prefs.saved).sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
    return viewHead('Favorites', 'Stories you saved. Kept on this device — available offline.') +
      (list.length ? `<div class="grid">${list.map(card).join('')}</div>` : empty('🔖', 'No saved stories', 'Tap the bookmark on any story to keep it here.'));
  },

  async search() {
    const q = app.params.q || '';
    setTimeout(() => { const i = $('#q'); if (i && !q) i.focus(); }, 50);
    let html = viewHead('Search') + `<form class="search-box" id="searchForm" role="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="q" name="q" type="search" placeholder="Search stories, brands, towns…" value="${esc(q)}" autocomplete="off" enterkeyhint="search"></form>`;
    if (!q) {
      const names = await brandNames();
      const sugg = ['Naperville', 'I-88', 'Metra', 'recall', 'iPhone', 'Celsius', 'PlayStation', 'Mustang', 'Chick-fil-A', 'Costco', ...[...prefs.brands].map((b) => names[b]).filter(Boolean)];
      return html + `<div class="chips">${[...new Set(sugg)].map((s) => `<a class="chip" href="#/search?q=${encodeURIComponent(s)}">${esc(s)}</a>`).join('')}</div>`;
    }
    const F = [['', 'All'], ['breaking', 'Breaking'], ['today', 'Today'], ['week', 'This Week'], ['c:dupage', 'DuPage'], ['c:energy', 'Energy'], ['c:fitness', 'Fitness'], ['c:tech', 'Tech'], ['c:auto', 'Automotive'], ['c:gaming', 'Gaming'], ['c:food', 'Food'], ['c:retail', 'Retail'], ['c:clothing', 'Clothing'], ['deals', 'Deals'], ['recalls', 'Recalls']];
    const f = app.params.f || '';
    html += `<div class="chips">${F.map(([id, l]) => `<a class="chip ${f === id ? 'on' : ''}" href="#/search?${qs({ q, f: id })}">${esc(l)}</a>`).join('')}</div>`;
    const fv = f.startsWith('c:') ? { view: 'all', category: f.slice(2) } : { view: f || 'all' };
    const data = await api(`/api/stories?${qs({ ...fv, q, limit: 80 })}`);
    html += `<div class="toggle" style="margin-bottom:14px"><span>${data.total} stor${data.total === 1 ? 'y' : 'ies'} on the radar for “${esc(q)}”</span>${app.mode === 'server' ? `<button class="btn small" data-action="live-search" data-q="${esc(q)}">🌐 Search the web live</button>` : ''}</div>`;
    html += data.stories.length ? `<div class="grid" id="results">${data.stories.map(card).join('')}</div>` : `<div id="results">${empty('🔎', 'Nothing on the radar yet', 'Run a live web search to pull the newest coverage for this term into SMASH NEWS.')}</div>`;
    return html;
  },

  async sources() {
    const { sources, runs } = await api('/api/sources');
    const m = app.meta;
    const bad = sources.filter((s) => s.enabled && s.lastStatus === 'error');
    const sorted = [...sources].sort((a, b) => (b.lastStatus === 'error') - (a.lastStatus === 'error') || a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    const run = runs[0];
    let html = viewHead('Sources & Health', 'Every feed SMASH NEWS watches, when it was last checked, and whether it worked.');
    html += `<div class="stats">
      <div class="stat"><b>${m?.sourceSummary?.enabled ?? sources.length}</b><span>Enabled</span></div>
      <div class="stat new"><b>${m?.sourceSummary?.healthy ?? '–'}</b><span>Healthy</span></div>
      <div class="stat breaking"><b>${bad.length}</b><span>Failing</span></div>
      <div class="stat"><b>${m?.counts?.total ?? '–'}</b><span>Stories</span></div>
      <div class="stat"><b>${m?.intervals?.fast ?? 5}m</b><span>Fast cycle</span></div>
      <div class="stat"><b>${m?.intervals?.normal ?? 20}m</b><span>Full cycle</span></div></div>`;
    if (run) html += `<div class="box"><h5>Last sweep · ${esc(fmt(run.finishedAt))} · ${esc(run.trigger)}</h5><div class="src-line"><span>Checked <b>${run.sourcesChecked}</b></span><span>OK <b>${run.ok}</b></span><span>Failed <b>${run.failed}</b></span><span>New <b>${run.added}</b></span><span>Changed <b>${run.changed}</b></span><span>Duplicates merged <b>${run.duplicates}</b></span><span>Rejected (not DuPage) <b>${run.rejected}</b></span><span>Enriched <b>${run.enriched}</b></span><span>${Math.round(run.durationMs / 100) / 10}s</span></div></div>`;
    if (app.mode === 'static') html += `<div class="box"><h5>Hosted mode</h5>GitHub Actions sweeps these sources about every 10 minutes and republishes the app. To add or remove feeds, edit <b>src/config.js</b> in the repo.</div>`;
    else html += `<div class="box"><h5>Add a feed</h5><form class="form" id="addSource"><input name="name" placeholder="Name (e.g. Naperville Police)" required><input name="url" type="url" placeholder="RSS / Atom feed URL" required><select name="category">${Object.entries(CAT).map(([id, [, l]]) => `<option value="${id}">${esc(l)}</option>`).join('')}</select><button class="btn small" type="submit">Add</button></form></div>`;
    html += `<div class="table">${sorted.map((s) => `<div class="src-row"><span class="st ${esc(s.lastStatus)}"></span>
      <div><b>${esc(s.name)}</b> <span class="small">${esc(CAT[s.category]?.[1] || s.category)} · ${s.official ? 'official · ' : ''}every ${s.intervalMinutes}m · ${esc(s.type)}</span><br>
      <span class="small">${s.lastCheckedAt ? `checked ${ago(s.lastCheckedAt)}` : 'not checked yet'}${s.lastSuccessAt ? ` · last success ${ago(s.lastSuccessAt)}` : ''}${s.latencyMs != null ? ` · ${s.latencyMs}ms` : ''}${s.lastItemCount != null ? ` · ${s.lastItemCount} items, ${s.lastAdded} new${s.lastRejected ? `, ${s.lastRejected} rejected` : ''}` : ''}</span>
      ${s.lastError ? `<div class="err">${esc(s.lastError)}${s.consecutiveFailures > 1 ? ` (×${s.consecutiveFailures})` : ''}</div>` : ''}</div>
      <div style="display:flex;gap:8px;align-items:center">${s.custom ? `<button class="btn small" data-del-source="${esc(s.id)}">Remove</button>` : ''}${app.mode === 'static' ? '' : `<button class="switch ${s.enabled ? 'on' : ''}" data-source="${esc(s.id)}" data-enabled="${s.enabled}" aria-label="Toggle ${esc(s.name)}"></button>`}</div></div>`).join('')}</div>`;
    return html;
  },

  async story() {
    // Deep link: render home underneath and open the sheet.
    const id = app.params.id;
    const html = await views.home();
    setTimeout(() => openStory(id), 0);
    return html;
  },
};

async function listView({ view: v, title, sub, emptyIcon, emptyText, chips, render: renderItem = card, grid = 'grid' }) {
  const p = app.params;
  const limit = 30;
  const offset = Number(p.offset || 0);
  const data = await api(`/api/stories?${qs({ view: v, category: p.category, limit: limit + offset })}`);
  let html = viewHead(title, sub);
  if (chips) {
    const cats = ['dupage', 'news', 'tech', 'auto', 'gaming', 'energy', 'fitness', 'food', 'clothing', 'retail', 'deals', 'recalls'];
    html += `<div class="chips"><a class="chip ${!p.category ? 'on' : ''}" href="#/${v === 'week' ? 'week' : v}">All</a>${cats.map((c) => `<a class="chip ${p.category === c ? 'on' : ''}" href="#/${v}?category=${c}">${CAT[c][0]} ${esc(CAT[c][1])}</a>`).join('')}</div>`;
  }
  if (!data.stories.length) return html + (noDataYet() || empty(emptyIcon, `No ${title.toLowerCase()} right now`, emptyText || 'Nothing matches yet — the radar keeps sweeping automatically.'));
  html += `<div class="${grid}">${data.stories.map(renderItem).join('')}</div>`;
  if (data.total > data.stories.length) html += `<div class="more"><a class="btn small" href="#/${v}?${qs({ category: p.category, offset: offset + limit })}">Load more (${data.total - data.stories.length})</a></div>`;
  return html;
}

let brandCache = null;
async function brandNames() {
  if (!brandCache) { const { brands } = await api('/api/brands'); brandCache = Object.fromEntries(brands.map((b) => [b.id, b.name])); }
  return brandCache;
}

// ---------------- story sheet ----------------
async function openStory(id) {
  let s = app.stories.get(id) || prefs.saved[id];
  try { s = await api(`/api/stories/${encodeURIComponent(id)}`); app.stories.set(id, s); } catch (e) { if (!s) return toast('Story no longer on the radar'); }
  const loc = s.location;
  const changes = (s.changes || []).map((c) => `<div class="item"><div class="when">${esc(fmt(c.at))}${c.via ? ` · via ${esc(c.via)}` : ""}</div>
    ${c.title ? `<div><span class="from">${esc(c.title.from)}</span><br><span class="to">→ ${esc(c.title.to)}</span></div>` : ''}
    ${c.summary ? `<div style="margin-top:6px"><span class="from">${esc(c.summary.from)}</span><br><span class="to">→ ${esc(c.summary.to)}</span></div>` : ''}</div>`).join('');
  const sheet = $('#sheet');
  sheet.innerHTML = `<div class="grab"></div><button class="close" data-action="close" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
    <div class="media">${media(s, true)}</div>
    <div class="content">
      <div style="display:flex;gap:6px;flex-wrap:wrap">${badges(s, 6)}${!['dupage', 'recalls', 'deals'].includes(s.category) ? `<span class="badge cat">${esc(CAT[s.category]?.[1] || s.category)}</span>` : ''}${s.brands.map((b) => `<span class="badge cat">${esc(b)}</span>`).join('')}</div>
      <h2>${esc(s.title)}</h2>
      <div class="src-line"><b>${esc(s.sourceName)}</b>${s.sourceDomain ? `<span>${esc(s.sourceDomain)}</span>` : ''}${s.official ? '<span style="color:var(--accent)">Official source</span>' : ''}</div>
      <div class="times"><div><span>Published</span>${esc(fmt(s.publishedAt))}</div><div><span>Discovered</span>${esc(fmt(s.discoveredAt))}</div>
        ${s.lastChangedAt ? `<div><span>Last changed</span>${esc(fmt(s.lastChangedAt))}</div>` : ''}${s.expiresAt ? `<div><span>Expires</span>${esc(fmt(s.expiresAt))}</div>` : ''}</div>
      ${s.summary ? `<div class="summary">${esc(s.summary)}</div>` : '<div class="summary muted">The source didn\'t include a summary — open the original for full details.</div>'}
      ${s.instruction ? `<div class="box alert"><h5>Safety instructions</h5>${esc(s.instruction)}</div>` : ''}
      ${s.recall ? recallBox(s) : ''}
      ${s.product ? productBox(s) : ''}
      <div class="box why"><h5>Why it matters</h5>${esc(s.whyItMatters)}</div>
      ${changes ? `<div class="box changed diff"><h5>What changed?</h5>${changes}</div>` : ''}
      ${loc ? `<div class="box loc"><h5>${loc.status === 'nearby' ? 'Location — not verified' : 'DuPage verification'}</h5>${loc.status === 'nearby' ? '≈' : '✓'} ${esc(loc.reason)}${loc.roads?.length ? `<div class="muted" style="margin-top:4px">Roads mentioned: ${esc(loc.roads.join(', '))}</div>` : ''}${loc.incident ? `<div class="muted">Type: ${esc(loc.incident.label)}</div>` : ''}</div>` : ''}
      ${s.alsoReportedBy?.length ? `<div class="box"><h5>Also reported by</h5><div class="links">${s.alsoReportedBy.map((r) => `<a href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener"><span>${esc(r.name)}</span><span>↗</span></a>`).join('')}</div></div>` : ''}
      <div class="muted" style="font-size:12px">ID ${esc(s.id)} · via ${esc(s.feedName || s.sourceName)}${s.aiEnriched ? ' · summary polished by AI from source text' : ''}</div>
      <div class="actions">
        <a class="btn primary" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">Read original ↗</a>
        <button class="btn" data-post="${esc(s.id)}" aria-label="Make Instagram post">📸</button>
        <button class="btn" data-action="reel-add" data-id="${esc(s.id)}" aria-label="Add to reel">🎬</button>
        <button class="btn ${isSaved(s.id) ? 'on' : ''}" data-save="${esc(s.id)}" aria-label="Save">${STAR}</button>
        <button class="btn" data-action="share" data-id="${esc(s.id)}" aria-label="Share"><svg viewBox="0 0 24 24"><path d="M12 3v13M7 8l5-5 5 5"/><path d="M5 13v7h14v-7"/></svg></button>
      </div>
    </div>`;
  $('#sheetBackdrop').hidden = false;
  sheet.hidden = false;
  sheet.scrollTop = 0;
  document.body.style.overflow = 'hidden';
}
// ---------------- Post Studio (Instagram) ----------------
let postMod = null;
let postState = { ids: [], recap: false, format: 'feed', files: [], caption: '' };
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: t }); document.body.append(ta); ta.select();
    try { document.execCommand('copy'); } catch {} ta.remove(); return false;
  }
}
// Weekly: rank by how big a story got (coverage, breaking, recalls), not just how recent.
function pickWeekly(all) {
  const weekAgo = Date.now() - 7 * 864e5;
  const pool = all.filter((x) => Date.parse(x.publishedAt || x.discoveredAt) > weekAgo && !x.tags.includes('RUMOR') && !x.tags.includes('LEAK'));
  const big = (x) => (x.alsoReportedBy?.length || 0) * 10 + (x.tags.includes('TRENDING') ? 20 : 0) + (x.status === 'BREAKING' ? 15 : 0) + (x.tags.includes('RECALL') ? 8 : 0) + (x.tags.includes('LAUNCH') ? 6 : 0) + (x.official ? 5 : 0) + (x.location && ['confirmed', 'verified'].includes(x.location.status) ? 8 : 0) + (x.imageUrl ? 4 : 0) + x.score / 20;
  const ranked = pool.slice().sort((a, b) => big(b) - big(a));
  const out = []; const cats = new Set();
  for (const x of ranked) { if (out.length >= 9) break; if (!cats.has(x.category)) { out.push(x); cats.add(x.category); } }
  for (const x of ranked) { if (out.length >= 9) break; if (!out.includes(x)) out.push(x); }
  return out;
}
function pickRecap(all) {
  const today = dayKey(Date.now());
  const pool = all.filter((x) => x.status !== 'EARLIER' && (dayKey(x.publishedAt || x.discoveredAt) === today || ['NEW', 'BREAKING', 'UPDATED'].includes(x.status)));
  const src = (pool.length >= 5 ? pool : all).slice().sort((a, b) => (b.imageUrl ? 8 : 0) + b.score - ((a.imageUrl ? 8 : 0) + a.score));
  const out = []; const cats = new Set();
  for (const x of src) { if (out.length >= 5) break; if (!cats.has(x.category)) { out.push(x); cats.add(x.category); } }
  for (const x of src) { if (out.length >= 5) break; if (!out.includes(x)) out.push(x); }
  return out;
}
async function openPostStudio({ ids = [], recap = false, weekly = false, format = 'feed' }) {
  postState = { ids, recap, weekly, format, files: [], caption: '' };
  const sheet = $('#sheet');
  sheet.innerHTML = `<div class="grab"></div><button class="close" data-action="close" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
    <div class="sheet-title">${recap ? (weekly ? 'Weekly Recap' : 'Daily Recap') : 'Make a Post'}</div>
    <div class="content" style="padding-top:0"><div class="chips" style="margin:0 0 12px">${Object.entries({ feed: 'Feed 4:5', story: 'Story 9:16' }).map(([k, l]) => `<button class="chip ${format === k ? 'on' : ''}" data-fmt="${k}">${l}</button>`).join('')}</div>
    <div class="post-previews" id="postPreviews"><div class="skeleton" style="aspect-ratio:${format === 'feed' ? '4/5' : '9/16'};width:${recap ? '78%' : '100%'};max-width:420px"></div></div>
    <div class="post-actions"><button class="btn primary" data-action="share-post" id="shareBtn" disabled>Rendering…</button><button class="btn" data-action="copy-caption">Copy caption</button></div>
    <p class="muted" style="font-size:12.5px;margin:6px 0 10px">Share opens the iPhone share sheet: pick <b>Instagram</b> (Feed/Stories) or <b>Save Image</b>. The caption is copied automatically, so just paste it. You can also press and hold an image to save it.</p>
    <textarea id="postCaption" class="caption" rows="9" spellcheck="false"></textarea></div>`;
  $('#sheetBackdrop').hidden = false;
  sheet.hidden = false;
  sheet.scrollTop = 0;
  document.body.style.overflow = 'hidden';
  try {
    postMod ||= await import('./post.js');
    let stories;
    if (recap) {
      const all = (await api(`/api/stories?${qs({ view: weekly ? 'week' : 'all', limit: 200 })}`)).stories;
      stories = weekly ? pickWeekly(all) : pickRecap(all);
    } else {
      stories = await Promise.all(ids.map(async (id) => app.stories.get(id) || api(`/api/stories/${encodeURIComponent(id)}`)));
    }
    const canvases = recap
      ? [await postMod.renderRecapCover(stories, format, weekly ? "THIS WEEK'S NEWS" : "TODAY'S NEWS", weekly ? postMod.weekRange() : null), ...(await Promise.all(stories.map((x, i) => postMod.renderStoryPost(x, format, { slide: `${i + 2}/${stories.length + 1}` }))))]
      : await Promise.all(stories.map((x) => postMod.renderStoryPost(x, format)));
    const blobs = await Promise.all(canvases.map(postMod.toBlob));
    if (postState.ids !== ids || postState.format !== format || postState.recap !== recap || postState.weekly !== weekly) return; // superseded
    const stamp = new Date().toISOString().slice(0, 10);
    postState.files = blobs.map((b, i) => new File([b], `smash-radar-${stamp}-${recap ? (weekly ? 'weekly' : 'recap') : (stories[0].id)}-${i + 1}.jpg`, { type: 'image/jpeg' }));
    postState.caption = recap ? postMod.recapCaption(stories, weekly) : postMod.captionFor(stories[0]);
    $('#postPreviews').innerHTML = postState.files.map((f) => `<img src="${URL.createObjectURL(f)}" alt="Post preview" class="${format}">`).join('');
    $('#postCaption').value = postState.caption;
    const btn = $('#shareBtn');
    btn.disabled = false;
    btn.textContent = recap ? `Share ${postState.files.length} slides` : 'Share to Instagram';
  } catch (err) {
    $('#postPreviews').innerHTML = `<div class="empty"><p>Couldn't render this post: ${esc(err.message)}</p></div>`;
  }
}
async function sharePost() {
  const { files } = postState;
  if (!files.length) return;
  const caption = $('#postCaption').value;
  copyText(caption);
  if (navigator.canShare && navigator.canShare({ files })) {
    try { await navigator.share({ files }); toast('Caption copied — paste it in Instagram'); } catch (err) { if (err.name !== 'AbortError') toast('Share failed — press and hold the image to save it'); }
    return;
  }
  // Desktop fallback: download the images
  for (const f of files) {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(f), download: f.name });
    document.body.append(a); a.click(); a.remove();
  }
  toast('Images downloaded · caption copied');
}


const STATES = ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming'];
const SEG_LABEL = { intro: 'Intro', breaking: 'Breaking', dupage: 'DuPage', roads: 'Roads', local: 'Chicagoland', recall: 'Recall', product: 'New drop', deal: 'Deal', opening: 'Opening', national: 'U.S.', nfl: 'NFL', outro: 'Sign-off' };

function roadRow(s, i = 0) {
  app.stories.set(s.id, s);
  const inc = s.location?.incident || s.region?.incident;
  const where = s.location && ['confirmed', 'verified'].includes(s.location.status) ? (s.location.places.filter((x) => x !== 'DuPage County')[0] || 'DuPage County') : `${s.region?.county || ''} County`;
  return `<article class="row" style="animation-delay:${Math.min(i, 10) * 25}ms" data-story="${esc(s.id)}">
    <div class="ico ${['crash', 'fire', 'emergency', 'police'].includes(inc?.id) ? 'hot' : ''}">${INC_ICON[inc?.id] || '🚧'}</div>
    <div><div class="meta"><span class="badge ${s.status}">${s.status}</span>${inc ? `<b>${esc(inc.label)}</b>` : ''}${s.location?.roads?.length ? `<span>${esc(s.location.roads.join(' · '))}</span>` : ''}</div>
      <h4>${esc(s.title)}</h4>
      <div class="meta"><span class="verify">📍 ${esc(where)}</span><span>${esc(s.sourceName)}</span><span>${ago(s.publishedAt || s.discoveredAt)}</span></div></div>
    ${s.imageUrl ? `<div class="thumb">${media(s)}</div>` : '<span></span>'}
  </article>`;
}

function ytSearch(g) {
  const q = `${g.away.full || g.away.name} vs ${g.home.full || g.home.name} highlights${g.week ? ` week ${g.week}` : ''} NFL`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
}
function gameCard(g) {
  const team = (t, other) => `<div class="gt ${g.state === 'post' && t.winner ? 'win' : ''}">${t.logo ? `<img src="${esc(imgUrl(t.logo))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="lg">${esc(t.abbr)}</span>`}<span class="nm">${esc(t.name || t.abbr)}<small>${esc(t.record)}</small></span><span class="sc">${g.state === 'pre' ? '' : esc(t.score)}</span></div>`;
  const when = g.state === 'pre' ? new Date(g.date).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: TZ }) : g.detail;
  const lead = g.leaders?.[0];
  return `<button class="game" data-game="${esc(g.id)}"><div class="gs ${g.state}">${g.state === 'in' ? '● ' : ''}${esc(when)}${g.broadcast && g.state === 'pre' ? ` · ${esc(g.broadcast)}` : ''}</div>${team(g.away)}${team(g.home)}${lead ? `<div class="gl">⭐ ${esc(lead.player)} · ${esc(lead.value)}</div>` : ''}${g.state !== 'pre' ? `<div class="gh">${(g.clips?.length || 0) + (g.mainHighlight ? 1 : 0) ? `⚡ ${(g.clips?.length || 0) + (g.mainHighlight ? 1 : 0)} highlight clips` : '▶ Highlights'}${g.fantasy ? ` · 🏆 ${g.fantasy.away.total.toFixed(0)}–${g.fantasy.home.total.toFixed(0)} fantasy` : ''}</div>` : ''}</button>`;
}
function videoCard(v) {
  return `<button class="card vcard" data-video="${esc(v.videoId)}" data-vtitle="${esc(v.title)}"><div class="media"><img src="${esc(imgUrl(v.thumb))}" alt="" loading="lazy" referrerpolicy="no-referrer" onload="this.classList.add('loaded')"><span class="play">▶</span></div><div class="body"><h3>${esc(v.title)}</h3><div class="foot"><span class="src">NFL</span><span>·</span><span>${ago(v.published)}</span></div></div></button>`;
}
function openSheetHtml(html) {
  $('#sheet').innerHTML = `<div class="grab"></div><button class="close" data-action="close" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>${html}`;
  $('#sheet').hidden = false; $('#sheetBackdrop').hidden = false; $('#sheet').scrollTop = 0; document.body.style.overflow = 'hidden';
}
function openVideo(id, title) {
  openSheetHtml(`<div class="video-wrap"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?playsinline=1&autoplay=1&rel=0" title="${esc(title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div><div class="content"><h2>${esc(title)}</h2><a class="btn" href="https://www.youtube.com/watch?v=${encodeURIComponent(id)}" target="_blank" rel="noopener">Open in YouTube ↗</a></div>`);
}
// ---------- Live road map (official state DOT work zones/closures with exact roads + times, plus news crashes)
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  return app.leafletLoading ||= new Promise((res, rej) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.append(css);
    const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'; sc.onload = res; sc.onerror = rej; document.head.append(sc);
  });
}
async function openRoadMap() {
  openSheetHtml(`<div class="lm"><div class="lm-top"><b>🗺️ Live road map</b><span class="muted" id="lmInfo">Loading official state feeds…</span></div><div class="lm-states" id="lmStates"></div><div id="lmap"></div>
    <div class="lm-key"><span style="--k:#ff9f1c">⛔ Closure</span><span style="--k:#ffd400">🚧 Construction</span><span style="--k:#ff3d2e">💥 Crash / news</span></div></div>`);
  document.getElementById('sheet').classList.add('sheet-full');
  let live = null, rw = null;
  try { [live, rw] = await Promise.all([api('/api/roadlive').catch(() => null), api('/api/roadwatch').catch(() => null), loadLeaflet()]); } catch { toast('Map failed to load'); return; }
  const map = app.lmap = L.map('lmap', { zoomControl: true, preferCanvas: true }).setView([39.5, -96], 4);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, attribution: 'Esri, HERE, Garmin, © OpenStreetMap contributors' }).addTo(map);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, opacity: 0.9 }).addTo(map);
  const fmt = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
  const states = {}; let n = 0;
  for (const [st, evs] of Object.entries(live?.states || {})) {
    for (const e of evs) {
      const col = e.type === 'closure' ? '#ff9f1c' : '#ffd400';
      const ll = e.coords.map((c) => [c[1], c[0]]);
      const pop = `<b>${e.type === 'closure' ? '⛔ CLOSURE' : '🚧 CONSTRUCTION'}</b><br><b>${esc(e.road || 'Road work')}</b> ${esc(e.direction || '')}${e.from || e.to ? `<br>${esc([e.from, e.to].filter(Boolean).join(' → '))}` : ''}${e.lanes ? `<br>${e.lanes} lane(s) closed` : ''}${e.impact ? `<br>${esc(e.impact)}` : ''}<br><b>Start:</b> ${esc(fmt(e.start))}<br><b>End:</b> ${esc(fmt(e.end))}${e.desc ? `<br><small>${esc(e.desc)}</small>` : ''}<br><small>${esc(e.source)} · official</small>`;
      const layer = ll.length > 1 ? L.polyline(ll, { color: col, weight: 5, opacity: 0.9 }) : L.circleMarker(ll[0], { radius: 6, color: col, fillOpacity: 0.9 });
      layer.bindPopup(pop).addTo(map); n++;
      (states[st] ||= L.latLngBounds(ll)).extend(L.latLngBounds(ll));
    }
  }
  app.roadStates = states;
  const newsCount = rw?.news || 0;
  $('#lmInfo').textContent = `${n} official closures & work zones in ${Object.keys(states).length} states · ${newsCount} crash/news reports · updated ${clock(live?.updatedAt)}`;
  $('#lmStates').innerHTML = Object.keys(states).sort().map((st) => `<button class="chip" data-action="rm-state" data-st="${esc(st)}">${esc(st)} <b>${(live.states[st] || []).length}</b></button>`).join('')
    + (rw?.states || []).filter((s) => !states[s.name]).map((s) => `<span class="chip muted">${esc(s.name)} · news only</span>`).join('');
  setTimeout(() => map.invalidateSize(), 200);
}
function fantasyBoard(g) {
  const f = g.fantasy; if (!f?.away || !f?.home) return '';
  const col = (k) => { const t = f[k]; const team = g[k]; const lead = f[k].total >= f[k === 'away' ? 'home' : 'away'].total;
    return `<div class="fz-col" style="--tc:${esc(team.color || '#444')}"><div class="fz-head">${team.logo ? `<img src="${esc(imgUrl(team.logo))}" alt="" referrerpolicy="no-referrer">` : ''}<span>${esc(team.name || team.abbr)}</span><b class="${lead ? 'lead' : ''}">${t.total.toFixed(1)}</b></div>
      ${t.players.map((p) => `<div class="fz-p"><i class="pos ${esc(p.pos.replace('/', ''))}">${esc(p.pos)}</i><span><b>${esc(p.short || p.player)}</b><small>${esc(p.line)}</small></span><em class="${p.pts >= 15 ? 'hot' : p.pts < 0 ? 'neg' : ''}">${p.pts.toFixed(1)}</em></div>`).join('')}</div>`; };
  return `<div class="fz"><div class="fz-title">🏆 Fantasy showdown <small>${g.state === 'in' ? '● LIVE · ' : ''}${esc(f.scoring || 'ESPN PPR')} · every player's real fantasy points</small></div><div class="fz-cols">${col('away')}${col('home')}</div></div>`;
}
function playsList(g) {
  if (!g.plays?.length) return '';
  const Q = ['', 'Q1', 'Q2', 'Q3', 'Q4', 'OT', '2OT'];
  return `<div class="box"><h5>Scoring plays + fantasy points</h5>${g.plays.map((p) => `<div class="sp"><span class="sp-q">${Q[p.period] || ''} ${esc(p.clock || '')}</span><span class="sp-t"><b>${esc(p.team)}</b> ${esc(String(p.text).replace(/\s*\((?:[^()]|\([^()]*\))*\)\s*$/, ''))}${(p.fantasy || []).map((x) => `<i class="fp">+${x.pts} ${esc(x.player === 'D/ST' ? `${p.team} D/ST` : x.player)}</i>`).join('')}</span><span class="sp-s">${esc(p.away)}-${esc(p.home)}</span></div>`).join('')}</div>`;
}
function openGame(id) {
  const g = app.nfl?.games.find((x) => String(x.id) === String(id));
  if (!g) return;
  const qs2 = Math.max(g.home.linescores.length, g.away.linescores.length);
  const box = qs2 ? `<table class="box"><tr><th></th>${Array.from({ length: qs2 }, (_, k) => `<th>${k < 4 ? `Q${k + 1}` : 'OT'}</th>`).join('')}<th>T</th></tr>${[g.away, g.home].map((t) => `<tr><td>${esc(t.abbr)}</td>${Array.from({ length: qs2 }, (_, k) => `<td>${t.linescores[k] ?? ''}</td>`).join('')}<td><b>${esc(t.score)}</b></td></tr>`).join('')}</table>` : '';
  const nClips = (g.clips?.length || 0) + (g.mainHighlight ? 1 : 0);
  openSheetHtml(`${g.highlight ? `<div class="video-wrap"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(g.highlight.videoId)}?playsinline=1&rel=0" title="Highlights" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>` : ''}
    <div class="content">
    ${g.state !== 'pre' ? `<div class="actions">${nClips ? `<button class="btn primary" data-action="rm-mode" data-id="${esc(g.id)}">🎞️ 60-sec highlight reel</button><button class="btn" data-action="hl-mode" data-id="${esc(g.id)}">⚡ All ${nClips} clips</button>` : `<a class="btn primary" href="${esc(ytSearch(g))}" target="_blank" rel="noopener">▶ Find highlights on YouTube</a>`}${g.state === 'post' ? `<button class="btn" data-action="game-reel" data-id="${esc(g.id)}">🎬 Reel</button>` : ''}</div>` : ''}
    <div class="kicker">🏈 NFL${g.week ? ` · Week ${g.week}` : ''} · ${esc(g.state === 'pre' ? 'Upcoming' : g.detail)}</div>
    <div class="bigscore"><div>${g.away.logo ? `<img src="${esc(imgUrl(g.away.logo))}" alt="">` : ''}<b>${esc(g.away.score)}</b><span>${esc(g.away.full)}</span></div><i>at</i><div>${g.home.logo ? `<img src="${esc(imgUrl(g.home.logo))}" alt="">` : ''}<b>${esc(g.home.score)}</b><span>${esc(g.home.full)}</span></div></div>
    ${box}
    ${fantasyBoard(g)}
    ${playsList(g)}
    ${!g.fantasy && g.leaders.length ? `<div class="box why"><h5>Player stats — game leaders</h5>${g.leaders.map((l) => `<div class="leader">${l.headshot ? `<img src="${esc(imgUrl(l.headshot))}" alt="" referrerpolicy="no-referrer">` : '<span class="hs">🏈</span>'}<div><b>${esc(l.player)}</b> <span class="muted">${esc(l.position)} ${esc(l.team)}</span><br><span class="muted">${esc(l.category)}</span> · ${esc(l.value)}</div></div>`).join('')}</div>` : ''}
    <div class="src-line">${g.venue ? `<span>📍 ${esc(g.venue)}</span>` : ''}${g.broadcast ? `<span>📺 ${esc(g.broadcast)}</span>` : ''}</div>
    <div class="actions">${g.state === 'post' ? '<a class="btn" href="https://www.nfl.com/plus/" target="_blank" rel="noopener">Full replay (NFL+) ↗</a>' : ''}<a class="btn" href="${esc(safeUrl(g.link))}" target="_blank" rel="noopener">ESPN box score ↗</a></div></div>`);
}

// ===================== SMASH LIVE: 24/7 TV channel =====================
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
/** Older 10-minute briefing → show format (fallback before the first 30-minute show exists). */
function asShow(b) {
  let t = 0;
  const segments = b.segments.map((g) => { const dur = g.dur || Math.max(2.5, g.text.split(/\s+/).length / 2.55 + 0.4); const x = { ...g, section: g.section || (SEG_LABEL[g.kind] || 'SMASH NEWS').toUpperCase(), start: t, dur }; t += dur; return x; });
  return { ...b, segments, totalSeconds: Math.round(t), startsAt: b.createdAt };
}
function tickerHtml(sh) {
  const seen = new Set();
  const items = sh.segments.filter((g) => g.title && !seen.has(g.title) && seen.add(g.title)).slice(0, 40);
  const one = items.map((g) => `<span><b>${esc((g.section || '').replace(/^THE /, ''))}</b> ${esc(g.title.replace(/^(live updates?|breaking|update)\s*:\s*/i, ''))}</span>`).join('<i>◆</i>');
  return `${one}<i>◆</i>${one}`;
}
function rundown(sh) {
  const out = [];
  sh.segments.forEach((g, k) => {
    if (k && g.section === sh.segments[k - 1].section) return;
    const n = sh.segments.slice(k).findIndex((x) => x.section !== g.section);
    const stories = sh.segments.slice(k, n < 0 ? undefined : k + n).filter((x) => x.title).length;
    out.push(`<button class="ls-seg" data-seg="${k}" data-sec="${esc(g.section)}"><span class="n">${mmss(g.start || 0)}</span><span><b>${esc(g.section)}</b>${stories ? ` <span class="muted">${stories} ${stories === 1 ? 'story' : 'stories'}</span>` : ''}</span></button>`);
  });
  return out.join('');
}
function transcriptHtml(sh) {
  return sh.segments.map((g, k) => `${k && g.section !== sh.segments[k - 1].section ? `<h6>${esc(g.section)}</h6>` : !k ? `<h6>${esc(g.section || 'SMASH NEWS')}</h6>` : ''}<p data-seg="${k}"><span class="tr-t">${mmss(g.start || 0)}</span>${esc(g.text)}</p>`).join('');
}
function markTranscript(k) {
  const box = $('#tvTranscript'); if (!box) return;
  box.querySelector('p.on')?.classList.remove('on');
  const p = box.querySelector(`p[data-seg="${k}"]`); if (!p) return;
  p.classList.add('on');
  box.scrollTo({ top: p.offsetTop - box.offsetTop - 40, behavior: 'smooth' }); // scroll inside the box only
}
async function gameReelPicker() {
  let nfl = app.nfl; if (!nfl) { try { nfl = app.nfl = await api('/api/nfl'); } catch { return ''; } }
  const finals = (nfl.games || []).filter((g) => g.state === 'post').reverse();
  if (!finals.length) return '';
  return section('NFL game reels — pick a game', '🏈', null, `<div class="gr-pick">${finals.map((g) => {
    const t = (x) => `<span class="${x.winner ? 'w' : ''}">${x.logo ? `<img src="${esc(imgUrl(x.logo))}" alt="" referrerpolicy="no-referrer">` : ''}${esc(x.abbr)} <b>${esc(x.score)}</b></span>`;
    return `<button class="gr" data-action="game-reel" data-id="${esc(g.id)}">${t(g.away)}${t(g.home)}<em>🎬 Make reel</em></button>`;
  }).join('')}</div>`);
}
function recapCard(r) {
  const t = (k) => `<span class="rc-t ${r.winner === k ? 'w' : ''}">${r[k].logo ? `<img src="${esc(imgUrl(r[k].logo))}" alt="" referrerpolicy="no-referrer">` : ''}<b>${esc(r[k].abbr)}</b><i>${esc(r[k].score)}</i></span>`;
  return `<div class="recap"><div class="rc-score">${t('away')}<em>FINAL</em>${t('home')}</div><div class="rc-meta">${r.week ? `Week ${r.week} · ` : ''}${r.playCount ?? (Array.isArray(r.plays) ? r.plays.length : r.plays) ?? 0} scoring plays</div>
    <div class="rc-actions"><button class="btn" data-action="game-reel" data-id="${esc(r.id)}">🎬 Reel</button>${r.fantasyPage || r.fantasyVideo ? `<button class="btn" data-action="fz-save" data-id="${esc(r.id)}">🏆 ⬇</button>` : ''}${r.page || r.video ? `<button class="btn primary" data-action="recap-play" data-id="${esc(r.id)}">▶ Watch</button>` : ''}${r.page || r.video ? `<button class="btn" data-action="recap-save" data-id="${esc(r.id)}">⬇ Save</button>` : ''}</div></div>`;
}
// ---------- Highlight Mode: official clips played back-to-back with SMASH cards in between (YouTube's own player)
function loadYT() {
  if (window.YT?.Player) return Promise.resolve();
  if (app.ytLoading) return app.ytLoading;
  app.ytLoading = new Promise((res) => { window.onYouTubeIframeAPIReady = () => res(); const sc = document.createElement('script'); sc.src = 'https://www.youtube.com/iframe_api'; document.head.append(sc); });
  return app.ytLoading;
}
// ---------- Reel Mode: 30–60 sec vertical highlight reel from official clips (YouTube player, start/end trimmed)
const PLAY_RANK = [[/touchdown|\bTD\b|scores?\b|to the house|walk-?off/i, 6], [/intercept|\bINT\b|\bpick(-six| 6)?\b/i, 5], [/sack|strip|forced fumble|fumble/i, 4], [/catch|grab|snag|one-?hand/i, 3], [/run\b|scramble|breaks? free|juke/i, 2], [/field goal|game-?winn|clutch|4th down/i, 3]];
function rankClip(v) {
  let sc = 0; for (const [re, w] of PLAY_RANK) if (re.test(v.title)) sc += w;
  const yd = +(String(v.title).match(/(\d{2,3})[- ]?(?:yard|yd)/i)?.[1] || 0); sc += Math.min(4, yd / 20);
  if (v.seconds && v.seconds > 240) sc -= 3; // long compilations last
  return sc;
}
function playKind(t) { return /touchdown|\bTD\b|scores?\b/i.test(t) ? 'TOUCHDOWN' : /intercept|\bINT\b|\bpick\b/i.test(t) ? 'INTERCEPTION' : /sack/i.test(t) ? 'SACK' : /fumble|strip/i.test(t) ? 'TAKEAWAY' : /catch|grab|snag/i.test(t) ? 'BIG CATCH' : /run|scramble/i.test(t) ? 'BIG RUN' : /field goal/i.test(t) ? 'FIELD GOAL' : 'BIG PLAY'; }
async function openReelMode(id) {
  let nfl = app.nfl; if (!nfl) { try { nfl = app.nfl = await api('/api/nfl'); } catch {} }
  const g = nfl?.games?.find((x) => String(x.id) === String(id)); if (!g) return toast('Game not found');
  // 1-2. best plays from the official clips, trimmed so the reel lands at 30–60 s
  let pool = (g.clips || []).map((v) => ({ ...v, rank: rankClip(v) })).sort((a, b) => b.rank - a.rank);
  const segs = []; let total = 0;
  for (const v of pool) { if (total >= 52) break; const len = v.seconds || 20; const d = Math.max(6, Math.min(12, len - 1)); segs.push({ ...v, start: 0, end: d, kind: playKind(v.title) }); total += d + 1; }
  if (!segs.length && g.mainHighlight) for (let k = 0; k < 5; k++) segs.push({ ...g.mainHighlight, start: 20 + k * 90, end: 31 + k * 90, kind: 'HIGHLIGHT' });
  if (!segs.length) { window.open(ytSearch(g), '_blank'); return; }
  app.rm = { g, segs, i: -1 };
  const f = g.fantasy;
  const fzSide = (k) => { const t = f?.[k]; const team = g[k]; return `<div class="rm-fz-t" style="--tc:${esc(team.color || '#444')}"><div class="rm-fz-h">${team.logo ? `<img src="${esc(imgUrl(team.logo))}" alt="" referrerpolicy="no-referrer">` : ''}<span>${esc(team.abbr)}</span><b id="rmTot-${k}">${t ? '0.0' : '—'}</b></div>
    ${(t?.players || []).filter((p) => p.pos !== 'D/ST').slice(0, 4).map((p) => `<div class="rm-fz-p" data-pl="${esc(p.player.toLowerCase())}"><i>${esc(p.pos)}</i><span>${esc(p.short || p.player)}</span><em>${p.pts.toFixed(1)}</em></div>`).join('')}</div>`; };
  openSheetHtml(`<div class="rm">
    <div class="rm-top"><div class="hl-bug"><i></i><b>SMASH</b> NEWS · HIGHLIGHT REEL</div>
      <div class="rm-game">${esc(g.away.abbr)} <b>${esc(g.away.score)}</b> <span>${g.week ? `WK ${g.week} · ` : ''}${esc(g.detail || 'FINAL')}</span> <b>${esc(g.home.score)}</b> ${esc(g.home.abbr)}</div>
      <div class="rm-cap" id="rmCap"><span class="rm-kind" id="rmKind">${segs.length} BEST PLAYS</span><b id="rmTitle">${esc(g.away.name)} vs ${esc(g.home.name)}</b></div></div>
    <div class="rm-video"><div id="rmp"></div><div class="rm-card show" id="rmCard"><div class="hl-n">HIGHLIGHT REEL</div><div class="hl-t">${segs.length} plays · about ${Math.round(total)} sec · official clips</div><button class="hl-go" data-action="rm-start">▶ Play reel</button></div></div>
    <div class="rm-bar"><i id="rmProg"></i></div>
    ${f ? `<div class="rm-fz"><div class="rm-fz-title">🏆 FANTASY SHOWDOWN <small>ESPN PPR</small></div><div class="rm-fz-cols">${fzSide('away')}<div class="rm-vs">VS</div>${fzSide('home')}</div></div>` : ''}
    <p class="muted rm-note">Plays the official NFL / team / network clips inside YouTube's player (original audio). Watch-only — the footage can't be saved as a file.</p></div>`);
  document.getElementById('sheet').classList.add('sheet-full');
  loadYT();
}
function rmTotals(p) { // fantasy totals count up as the reel plays
  const f = app.rm?.g?.fantasy; if (!f) return;
  for (const k of ['away', 'home']) { const e = document.getElementById(`rmTot-${k}`); if (e) e.textContent = (f[k].total * Math.min(1, p)).toFixed(1); }
}
async function rmPlay(i) {
  const r = app.rm; if (!r) return;
  const card = $('#rmCard');
  if (i >= r.segs.length) { rmTotals(1); if (card) { card.innerHTML = `<div class="hl-n">FINAL</div><div class="hl-t">${esc(r.g.away.abbr)} ${esc(r.g.away.score)} – ${esc(r.g.home.score)} ${esc(r.g.home.abbr)}${r.g.fantasy ? ` · Fantasy ${r.g.fantasy.away.total.toFixed(1)}–${r.g.fantasy.home.total.toFixed(1)}` : ''}</div><button class="hl-go" data-action="rm-start">↻ Replay</button>`; card.classList.add('show'); } return; }
  r.i = i; const v = r.segs[i];
  const kind = $('#rmKind'); const title = $('#rmTitle');
  if (kind) kind.textContent = `${v.kind} · ${i + 1}/${r.segs.length}`;
  if (title) title.textContent = String(v.title).replace(/\s*\|.*$/, '').replace(/\s*-\s*NFL.*$/i, '');
  const lt = String(v.title).toLowerCase();
  document.querySelectorAll('.rm-fz-p').forEach((e) => e.classList.toggle('on', lt.includes(e.dataset.pl.split(' ').slice(-1)[0])));
  if (card) { card.innerHTML = `<div class="hl-n">${esc(v.kind)}</div><div class="hl-t">${esc(title?.textContent || '')}</div>`; card.classList.remove('show'); void card.offsetWidth; card.classList.add('show'); }
  rmTotals((i + 1) / r.segs.length);
  const prog = $('#rmProg'); if (prog) prog.style.width = `${((i + 1) / r.segs.length) * 100}%`;
  await loadYT();
  const go = () => { if (app.rm === r && r.i === i) $('#rmCard')?.classList.remove('show'); };
  const opts = { videoId: v.videoId, startSeconds: v.start, endSeconds: v.end };
  if (!r.player) r.player = new YT.Player('rmp', { host: 'https://www.youtube-nocookie.com', videoId: v.videoId, playerVars: { playsinline: 1, rel: 0, modestbranding: 1, autoplay: 1, controls: 0, start: v.start, end: v.end },
    events: { onReady: (e) => { e.target.playVideo(); setTimeout(go, 900); }, onStateChange: (e) => { if (e.data === 0 && app.rm === r) rmPlay(r.i + 1); }, onError: () => rmPlay(r.i + 1) } });
  else { r.player.loadVideoById(opts); setTimeout(go, 900); }
}
async function openHighlightMode(id) {
  let nfl = app.nfl; if (!nfl) { try { nfl = app.nfl = await api('/api/nfl'); } catch {} }
  const g = nfl?.games?.find((x) => String(x.id) === String(id)); if (!g) return toast('Game not found');
  const list = [...(g.clips || [])]; if (g.mainHighlight) list.push({ ...g.mainHighlight, full: true });
  if (!list.length) { window.open(ytSearch(g), '_blank'); return; }
  app.hl = { g, list, i: -1 };
  const sc = (x) => `<span class="${x.winner ? 'w' : ''}">${x.logo ? `<img src="${esc(imgUrl(x.logo))}" alt="" referrerpolicy="no-referrer">` : ''}${esc(x.abbr)}<b>${esc(x.score)}</b></span>`;
  openSheetHtml(`<div class="hl">
    <div class="hl-stage"><div id="ytp"></div>
      <div class="hl-card show" id="hlCard"><div class="hl-bug"><i></i><b>SMASH</b> NEWS · HIGHLIGHT MODE</div><div class="hl-sc">${sc(g.away)}<em>FINAL</em>${sc(g.home)}</div><div class="hl-t">${list.length} official clips</div>
        <button class="hl-go" data-action="hl-start">▶ Start</button></div></div>
    <div class="hl-ctl"><button class="btn" data-action="hl-prev">⏮</button><span id="hlNow">Ready</span><button class="btn" data-action="hl-next">⏭</button></div>
    <div class="hl-list">${list.map((v, i) => `<button class="hl-item" data-action="hl-pick" data-i="${i}"><img src="${esc(imgUrl(v.thumb))}" alt="" loading="lazy" referrerpolicy="no-referrer"><span><b>${esc(v.title)}</b><small>${esc(v.channel)} · ${esc(v.length || '')}${v.full ? ' · full game highlights' : ''}</small></span></button>`).join('')}</div>
    <p class="muted hl-note">Official clips from the NFL, team and network channels, played with YouTube's player.</p></div>`);
  loadYT();
}
function hlCard(v, i, n) {
  const c = $('#hlCard'); if (!c) return;
  const g = app.hl.g;
  const fz = [...(g.fantasy?.away?.players || []), ...(g.fantasy?.home?.players || [])].filter((p) => p.pos !== 'D/ST' && String(v.title).toLowerCase().includes(String(p.player).split(' ').slice(-1)[0].toLowerCase())).slice(0, 2);
  c.innerHTML = `<div class="hl-bug"><i></i><b>SMASH</b> NEWS</div><div class="hl-n">${v.full ? 'FULL GAME' : `CLIP ${i + 1}<small>/${n}</small>`}</div><div class="hl-t">${esc(v.title)}</div>${fz.map((p) => `<div class="hl-fz">🏆 ${esc(p.player)} <b>${p.pts.toFixed(1)}</b> FPTS</div>`).join('')}<div class="hl-sc mini"><span>${esc(g.away.abbr)}<b>${esc(g.away.score)}</b></span><em>FINAL</em><span>${esc(g.home.abbr)}<b>${esc(g.home.score)}</b></span></div>`;
  c.classList.remove('show'); void c.offsetWidth; c.classList.add('show');
}
async function hlPlay(i) {
  const h = app.hl; if (!h) return;
  if (i >= h.list.length) { const c = $('#hlCard'); if (c) { c.innerHTML = '<div class="hl-n">THAT\'S A WRAP</div><div class="hl-t">SMASH NEWS · Highlight Mode</div>'; c.classList.add('show'); } return; }
  h.i = i; const v = h.list[i];
  document.querySelectorAll('.hl-item').forEach((b, k) => b.classList.toggle('on', k === i));
  const now = $('#hlNow'); if (now) now.textContent = `${i + 1} / ${h.list.length}`;
  hlCard(v, i, h.list.length);
  await loadYT();
  const start = () => { if (app.hl !== h || h.i !== i) return; $('#hlCard')?.classList.remove('show'); };
  if (!h.player) {
    h.player = new YT.Player('ytp', { videoId: v.videoId, host: 'https://www.youtube-nocookie.com', playerVars: { playsinline: 1, rel: 0, modestbranding: 1, autoplay: 1 },
      events: { onReady: (e) => { e.target.playVideo(); setTimeout(start, 1800); }, onStateChange: (e) => { if (e.data === 0) hlPlay(h.i + 1); }, onError: () => hlPlay(h.i + 1) } });
  } else { h.player.loadVideoById(v.videoId); setTimeout(start, 1800); }
}
async function runGameReel(id) {
  if (!reelSupported()) return toast('This browser can\'t record video');
  const AC = window.AudioContext || window.webkitAudioContext;
  const actx = new AC(); actx.resume?.();
  let nfl = app.nfl; if (!nfl) { try { nfl = app.nfl = await api('/api/nfl'); } catch {} }
  const g = nfl?.games?.find((x) => String(x.id) === String(id));
  if (!g) return toast('Game not found');
  const details = (app.recaps || []).find((r) => String(r.id) === String(id));
  openSheetHtml(`<div class="content reel-make"><h2>🏈 Making the ${esc(g.away.abbr)} @ ${esc(g.home.abbr)} reel</h2><p class="muted" id="rmStatus">Getting ready…</p>
    <div class="rm-prog"><i id="rmBar"></i></div><div class="rm-stage"><canvas id="rmCanvas"></canvas></div><p class="muted">Keep this screen open while it records.</p></div>`);
  try {
    const res = await makeGameReel(g, details && Array.isArray(details.plays) ? details : null, { canvas: $('#rmCanvas'), base: './', audioCtx: actx,
      onProgress: (p, msg) => { const b = $('#rmBar'); if (b) b.style.width = `${(p * 100).toFixed(1)}%`; const st = $('#rmStatus'); if (st) st.textContent = msg; } });
    const ext = res.type.includes('mp4') ? 'mp4' : 'webm';
    const url = URL.createObjectURL(res.blob);
    app.pendingFile = new File([res.blob], `smash-news-${g.away.abbr}-at-${g.home.abbr}.${ext}`.toLowerCase(), { type: res.type });
    openSheetHtml(`<div class="content reel-make"><h2>🔥 Game reel ready</h2><div class="video-wrap tall"><video src="${url}" controls playsinline autoplay loop></video></div>
      <div class="actions"><button class="btn primary" data-action="file-share">Save / share reel</button><button class="btn" data-action="game-reel" data-id="${esc(id)}">Make again</button></div>
      ${g.highlight ? `<p class="muted">Want the real footage? <a href="${esc(safeUrl(g.highlight.url))}" target="_blank" rel="noopener">Official NFL highlights ↗</a></p>` : ''}</div>`);
  } catch (e) { toast(`Reel failed: ${e.message}`); }
  finally { setTimeout(() => actx.close?.(), 2000); }
}
async function runReel() {
  const picks = prefs.reel.slice(0, 8);
  if (!picks.length) return toast('Pick at least one story first');
  if (!reelSupported()) return toast('This browser can\'t record video');
  const AC = window.AudioContext || window.webkitAudioContext;
  const actx = new AC(); actx.resume?.(); // must start inside the tap
  openSheetHtml(`<div class="content reel-make"><h2>🎬 Making your reel</h2><p class="muted" id="rmStatus">Getting ready…</p>
    <div class="rm-prog"><i id="rmBar"></i></div><div class="rm-stage"><canvas id="rmCanvas"></canvas></div><p class="muted">Keep this screen open while it records (about ${Math.round(4.6 + picks.length * 4.3)} seconds).</p></div>`);
  try {
    const stories = picks.map((p) => app.stories.get(p.id) || p);
    const res = await makeReel(stories, { canvas: $('#rmCanvas'), base: './', audioCtx: actx, title: stories.length === 1 ? 'BREAKING DOWN' : `TOP ${stories.length} STORIES`,
      onProgress: (p, msg) => { const b = $('#rmBar'); if (b) b.style.width = `${(p * 100).toFixed(1)}%`; const st = $('#rmStatus'); if (st) st.textContent = msg; } });
    const ext = res.type.includes('mp4') ? 'mp4' : 'webm';
    const url = URL.createObjectURL(res.blob);
    app.pendingFile = new File([res.blob], `smash-news-reel-${Date.now()}.${ext}`, { type: res.type });
    openSheetHtml(`<div class="content reel-make"><h2>🔥 Your reel is ready</h2><div class="video-wrap tall"><video src="${url}" controls playsinline autoplay loop></video></div>
      <div class="actions"><button class="btn primary" data-action="file-share">Save / share reel</button><button class="btn" data-action="reel-make">Make again</button></div>
      <p class="muted">${Math.round(res.seconds)} sec · ${(res.blob.size / 1e6).toFixed(1)} MB · ${ext.toUpperCase()}. On iPhone tap <b>Save / share</b> → <b>Save Video</b>.</p></div>`);
  } catch (e) { toast(`Reel failed: ${e.message}`); }
  finally { setTimeout(() => actx.close?.(), 2000); }
}
function openScript(text, name, when) {
  app.scriptText = text; app.scriptName = name;
  openSheetHtml(`<div class="content"><div class="kicker">🦁 SMASH NEWS · ${esc(when || '')}</div><h2>The script</h2><p class="muted">Everything Smash says in this rundown, word for word.</p>
    <div class="actions"><button class="btn primary" data-action="script-copy">Copy</button><button class="btn" data-action="script-save">Save as file</button></div>
    <pre class="script-text">${esc(text)}</pre></div>`);
}
async function videosHtml(limit = 99) {
  let v = [];
  try { v = (await api('/api/videos')).videos || []; } catch {}
  app.tvVideos = v;
  v = v.slice(0, limit);
  if (!v.length) return '<div class="muted tv-vid-empty">Every rundown is saved as a video about a minute after it airs. The first one will show up here soon.</div>';
  return v.map((x, k) => `<div class="tv-vid"><div class="tv-vid-i">🎬</div><div class="tv-vid-t"><b>${esc(clock(x.startsAt))} rundown</b><span class="muted">${x.minutes || 2} min · ${x.stories} stories · ${(x.bytes / 1e6).toFixed(1)} MB</span></div>
    <button class="chip" data-action="vid-play" data-k="${k}">▶</button><button class="chip on" data-action="vid-save" data-k="${k}">⬇ Video</button>${x.script ? `<button class="chip" data-action="vid-script" data-k="${k}">📄</button>` : ''}</div>`).join('');
}
function showScript(sh) {
  let sec = null;
  const lines = [`SMASH NEWS — Smash the lion's show (${clock(sh.startsAt || sh.createdAt)})`];
  for (const g of sh.segments) { if (g.section !== sec) { sec = g.section; lines.push('', `== ${sec} ==`); } lines.push(`[${mmss(g.start || 0)}] ${g.text}`); }
  return `${lines.join('\n')}\n`;
}
/** Save a file to the phone: the iPhone share sheet (Save Video / Save to Files), or a normal download elsewhere. */
async function saveFile(blobOrUrl, name, type) {
  try {
    toast('Getting it ready…');
    const blob = typeof blobOrUrl === 'string' ? await (await fetch(blobOrUrl)).blob() : blobOrUrl;
    const file = new File([blob], name, { type });
    if (navigator.canShare?.({ files: [file] })) {
      if (typeof blobOrUrl !== 'string') { await navigator.share({ files: [file], title: name }); return; }
      // downloading took a moment, so iPhone needs a fresh tap before it opens the share sheet
      app.pendingFile = file;
      openSheetHtml(`<div class="content"><h2>${type.startsWith('video') ? '🎬 Video ready' : '📄 Script ready'}</h2><p class="muted">${esc(name)} · ${(blob.size / 1e6).toFixed(1)} MB</p><div class="actions"><button class="btn primary" data-action="file-share">${type.startsWith('video') ? 'Save video' : 'Save script'}</button></div><p class="muted">On iPhone pick <b>Save Video</b> (Photos) or <b>Save to Files</b>.</p></div>`);
      return;
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30e3);
  } catch (e) { if (e?.name !== 'AbortError') toast(`Couldn't save: ${e.message}`); }
}
function livePos(sh) {
  const total = sh.totalSeconds || 1;
  const e = (Date.now() - Date.parse(sh.startsAt || sh.createdAt)) / 1000;
  return ((e % total) + total) % total;
}
function segAt(sh, pos) {
  for (let i = 0; i < sh.segments.length; i++) { const g = sh.segments[i]; if (pos < g.start + g.dur) return [i, Math.max(0, pos - g.start)]; }
  return [0, 0];
}
function showSegment(seg, k) {
  const gfx = $('#lsGraphic');
  const cap = $('#lsCaption');
  if (!gfx || !cap || !seg) return;
  cap.textContent = seg.text;
  markTranscript(k);
  const sec = $('#tvSec'); const head = $('#tvHead');
  if (sec) sec.textContent = `${seg.icon ? `${seg.icon} ` : ''}${seg.section || 'SMASH NEWS'}`;
  if (head) { head.textContent = seg.title || (seg.kind === 'intro' ? 'Smash the lion is on air' : seg.kind === 'outro' ? 'New rundown every 10 minutes' : seg.section || ''); head.classList.remove('in'); void head.offsetWidth; head.classList.add('in'); }
  const cur = app.tvShow?.segments ? seg.section : null;
  document.querySelectorAll('.ls-seg').forEach((b) => b.classList.toggle('on', b.dataset.sec === cur));
  const bump = $('#tvBumper');
  if (bump) {
    if (seg.kind === 'bumper' && seg.icon) { bump.innerHTML = `<span>${seg.icon}</span><b>${esc(seg.section)}</b><small>SMASH NEWS</small>`; bump.classList.remove('show'); void bump.offsetWidth; bump.classList.add('show'); }
    else if (seg.kind !== 'bumper') bump.classList.remove('show');
  }
  if (!seg.title) { gfx.classList.remove('show'); return; }
  const s = { category: seg.category === 'nfl' ? 'news' : seg.category, brands: [], location: null };
  const img = imgUrl(seg.imageUrl);
  gfx.innerHTML = `<div class="g-media">${img ? `<img src="${esc(img)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : placeholder(s)}</div><div class="g-text"><span class="g-kind">${esc(seg.section || SEG_LABEL[seg.kind] || '')}${seg.place ? ` · ${esc(seg.place)}` : ''}</span><b>${esc(seg.title)}</b>${seg.source ? `<small>${esc(seg.source)}</small>` : ''}</div>`;
  gfx.classList.remove('show'); void gfx.offsetWidth; gfx.classList.add('show');
}
function setPlayBtn(state) {
  const b = $('#lionPlay'); if (b) b.textContent = state === 'playing' ? '⏸' : '▶';
  if (state === 'blocked') { app.tvStarted = false; }
  $('#tvTap')?.classList.toggle('hide', state === 'playing' || (app.tvStarted && state !== 'blocked'));
}
function setLive(on) { app.tvLive = on; $('#tvGoLive')?.classList.toggle('on', on); $('#liveStage')?.classList.toggle('not-live', !on); }
function tvGoLive() {
  const sh = app.tvShow; if (!sh || !app.show) return;
  const [i, off] = segAt(sh, livePos(sh));
  app.tvStarted = true;
  setLive(true);
  app.show.stop();
  app.show.play(i, off);
}
async function tvSwitch(nb) {
  // a brand-new show just went on air: load it and join live
  app.tvShow = nb; app.tvPending = null;
  app.show.load(nb);
  const tk = $('#tvTicker'); if (tk) tk.innerHTML = tickerHtml(nb);
  const rl = document.querySelector('.ls-list'); if (rl) rl.innerHTML = rundown(nb);
  const tr = $('#tvTranscript'); if (tr) tr.innerHTML = transcriptHtml(nb);
  toast('🦁 New SMASH NEWS show is on air');
}
function initTv(sh) {
  if (app.show) app.show.destroy();
  const stage = $('#liveStage');
  if (!stage) return;
  app.tvStarted = false;
  app.show = new LionShow(stage, {
    onSegment: showSegment,
    onState: setPlayBtn,
    onAdvance: (i) => {
      if (app.tvPending && app.tvLive) { tvSwitch(app.tvPending); app.show.playing = true; tvGoLive(); return true; }
      return false;
    },
    onEnd: async () => {
      // end of the show: jump to the newest show (or run this one again) and stay live
      try { const nb = await api('/api/show'); if (nb.id !== app.tvShow?.id) await tvSwitch(nb); } catch {}
      if (app.tvLive) tvGoLive(); else { app.show.playing = true; app.show.play(0); }
    },
  });
  const vs = LionShow.voices();
  app.show.voice = vs[0] || null;
  if (window.speechSynthesis && !vs.length) window.speechSynthesis.onvoiceschanged = () => { if (app.show) app.show.voice = LionShow.voices()[0] || null; };
  app.show.load(sh);
  setLive(true);
  const [i] = segAt(sh, livePos(sh));
  app.show.i = i;
  showSegment(sh.segments[i], i);
  clearInterval(app.tvTick);
  app.tvTick = setInterval(() => {
    const c = $('#tvClock'); if (c) c.textContent = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
    const cur = app.tvShow; if (!cur || !app.show) return;
    let pos;
    if (app.show.playing) { const g = cur.segments[app.show.i]; pos = (g?.start || 0) + Math.min(app.show.segTime, g?.dur || 0); }
    else if (app.tvLive && !app.tvStarted) { pos = livePos(cur); const [k] = segAt(cur, pos); if (k !== app.show.i) { app.show.i = k; showSegment(cur.segments[k], k); } }
    else pos = cur.segments[app.show.i]?.start || 0;
    const p = $('#tvProg'); if (p) p.style.width = `${Math.min(100, (pos / (cur.totalSeconds || 1)) * 100).toFixed(2)}%`;
  }, 500);
  clearInterval(app.lionPoll);
  app.lionPoll = setInterval(async () => {
    try {
      const nb = await api('/api/show');
      if (nb.id === app.tvShow?.id) return;
      if (app.show?.playing) app.tvPending = nb; // switch after the current sentence
      else { await tvSwitch(nb); if (app.tvLive && !app.tvStarted) { const [k] = segAt(nb, livePos(nb)); app.show.i = k; showSegment(nb.segments[k], k); } }
    } catch {}
  }, 60e3);
}

function closeSheet() {
  try { app.hl?.player?.destroy(); } catch {} app.hl = null;
  try { app.rm?.player?.destroy(); } catch {} app.rm = null; $('#sheet')?.classList.remove('sheet-full');
  try { app.lmap?.remove(); } catch {} app.lmap = null;
  $('#sheet').hidden = true;
  $('#sheetBackdrop').hidden = true;
  document.body.style.overflow = '';
  if (location.hash.startsWith('#/story/')) history.replaceState(null, '', '#/home');
}

function toggleSave(id) {
  const s = app.stories.get(id) || prefs.saved[id];
  if (!s) return;
  if (prefs.saved[id]) { delete prefs.saved[id]; toast('Removed from Favorites'); } else { prefs.saved[id] = { ...s, savedAt: new Date().toISOString() }; toast('Saved to Favorites'); }
  saveSaved();
  document.querySelectorAll(`[data-save="${CSS.escape(id)}"]`).forEach((b) => b.classList.toggle('on', !!prefs.saved[id]));
  if (app.route === 'favorites') render();
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2600);
}

// ---------------- navigation chrome ----------------
function renderChrome() {
  document.documentElement.style.setProperty('--topbar-h', `${$('.topbar').offsetHeight}px`);
  const c = app.meta?.counts || {};
  $('#sideNav').innerHTML = NAV.map((n) => (n.group ? `<div class="group">${n.group}</div>` : `<a href="#/${n.r}" class="${app.route === n.r ? 'active' : ''}"><span class="ic">${n.ic}</span>${n.label}${n.count && c[n.count] ? `<span class="count ${n.hot ? 'hot' : ''}">${c[n.count]}</span>` : ''}</a>`)).join('');
  const tabs = [['home', 'Home'], ['reels', 'Reels'], ['roads', 'Roads'], ['nfl', 'NFL']];
  const inMore = !tabs.some(([r]) => r === app.route);
  $('#tabbar').innerHTML = tabs.map(([r, l]) => `<a href="#/${r}" class="${app.route === r ? 'active' : ''}">${ICONS[r]}<span>${l}</span>${r === 'breaking' && c.BREAKING ? `<span class="badge">${c.BREAKING}</span>` : ''}</a>`).join('') +
    `<button type="button" data-action="more" class="${inMore ? 'active' : ''}">${ICONS.more}<span>More</span></button>`;
  $('#pageTitle').textContent = TITLES[app.route] || 'SMASH NEWS';
  const m = app.meta;
  $('#sideFoot').innerHTML = m && app.mode === 'static' ? `Auto-sweep by GitHub Actions about every 10 min.<br>Last sweep ${clock(m.lastRefreshAt)}` : m ? `Auto-sweep: fast sources every ${m.intervals.fast}m, the rest every ${m.intervals.normal}–${m.intervals.slow}m.<br>Next sweep ${m.nextRefreshAt ? clock(m.nextRefreshAt) : 'on schedule'}${m.ai ? '<br>AI summaries: on' : ''}` : '';
  updateLive();
}

function updateLive() {
  const m = app.meta;
  const pill = $('#livePill');
  pill.classList.remove('ok', 'warn', 'bad');
  if (!navigator.onLine) { $('#liveText').textContent = 'Offline'; pill.classList.add('bad'); return; }
  if (!m) { $('#liveText').textContent = 'Connecting…'; return; }
  if (app.refreshing || m.refreshing) { $('#liveText').textContent = app.progressText || 'Sweeping…'; pill.classList.add('ok'); return; }
  const ss = m.sourceSummary || {};
  const checkedOnce = ss.enabled - (ss.neverChecked || 0);
  pill.classList.add(!m.lastRefreshAt ? 'warn' : ss.healthy === 0 ? 'bad' : ss.failing > checkedOnce / 2 ? 'warn' : 'ok');
  $('#liveText').innerHTML = m.lastRefreshAt ? `<span class="lp-word">Checked </span>${ago(m.lastRefreshAt)}` : 'Not checked yet';
}

function openMore() {
  const c = app.meta?.counts || {};
  const items = [['breaking', '🔥', 'Breaking', c.BREAKING], ['dupage', '📍', 'DuPage', c.dupage], ['local', '🗺️', 'Local & States'], ['foryou', '✨', 'For You'], ['posts', '📸', 'Post Studio'], ['daily', '📡', "Today's News"], ['today', '🆕', 'Today', c.NEW], ['week', '📅', 'This Week'], ['products', '📦', 'Products', c.products], ['deals', '💰', 'Deals', c.deals], ['recalls', '⚠️', 'Recalls', c.recalls], ['openings', '🏪', 'Openings'], ['brands', '⭐', 'My Brands', prefs.brands.size || ''], ['favorites', '🔖', 'Favorites', Object.keys(prefs.saved).length || ''], ['search', '🔎', 'Search'], ['sources', '🩺', 'Sources']];
  $('#sheet').innerHTML = `<div class="grab"></div><div class="sheet-title">More</div><div class="more-grid">${items.map(([r, ic, l, n]) => `<a href="#/${r}" data-action="close-nav"><span class="ic">${ic}</span>${l}${n ? `<span class="n">${n}</span>` : ''}</a>`).join('')}</div>`;
  $('#sheet').hidden = false;
  $('#sheetBackdrop').hidden = false;
}

// ---------------- router ----------------
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '') || 'home';
  const [path, query] = h.split('?');
  const parts = path.split('/');
  const params = Object.fromEntries(new URLSearchParams(query || ''));
  if (parts[0] === 'story') return { route: 'story', params: { id: parts[1] } };
  return { route: views[parts[0]] ? parts[0] : 'home', params };
}

let renderSeq = 0;
async function render({ quiet = false } = {}) {
  const { route, params } = parseHash();
  if (route !== 'lion' && app.show) { app.show.destroy(); app.show = null; clearInterval(app.lionPoll); clearInterval(app.tvTick); document.body.classList.remove('tv-mode'); }
  const changedRoute = route !== app.route;
  app.route = route;
  app.params = params;
  renderChrome();
  const seq = ++renderSeq;
  if (!quiet) view.innerHTML = route === 'home' ? `<div class="skeleton" style="height:120px;margin:4px 0 18px"></div><div class="skeleton" style="aspect-ratio:16/8;border-radius:22px"></div>` : skeletons();
  try {
    const html = await views[route]();
    if (seq !== renderSeq) return;
    view.innerHTML = html;
    if (changedRoute && !quiet) window.scrollTo({ top: 0 });
    markPicked();
  } catch (e) {
    if (seq !== renderSeq) return;
    view.innerHTML = empty('📡', navigator.onLine ? 'Couldn\'t load this view' : 'You\'re offline', esc(navigator.onLine ? e.message : 'Reconnect to load the latest radar. Saved stories are in Favorites.'), '<button class="btn small" data-action="reload">Try again</button>');
  }
}

// ---------------- refresh + live updates ----------------
async function loadMeta() {
  try {
    const prev = app.meta;
    app.meta = await api('/api/meta');
    if (prev && prev.lastRefreshAt && app.meta.lastRefreshAt !== prev.lastRefreshAt && !app.refreshing) onRemoteRefresh(app.meta.latestRun);
    app.lastSeenRefresh = app.meta.lastRefreshAt;
    renderChrome();
  } catch { updateLive(); }
}

function onRemoteRefresh(run) {
  const n = (run?.added || 0) + (run?.changed || 0);
  if (!n) { renderChrome(); return; }
  const pill = $('#newPill');
  pill.textContent = `↑ ${run.added} new${run.changed ? ` · ${run.changed} updated` : ''} — tap to load`;
  pill.hidden = false;
}

async function refreshNow() {
  if (app.refreshing) return;
  app.refreshing = true;
  app.progressText = 'Sweeping…';
  $('#refreshBtn').classList.add('spinning');
  $('#progress').classList.add('on');
  $('#progress i').style.width = '8%';
  updateLive();
  try {
    const r = await api('/api/refresh', { method: 'POST', body: { force: true } });
    if (r.run) finishRefresh(r.run); // synchronous hosts (Netlify) return the run directly
    else setTimeout(() => app.refreshing && pollUntilDone(), 4000);
  } catch (e) {
    endRefreshUi();
    toast(`Refresh failed: ${e.message}`);
  }
}
async function pollUntilDone() {
  // Fallback when the event stream isn't connected.
  for (let i = 0; i < 90 && app.refreshing; i++) {
    const m = await api('/api/meta').catch(() => null);
    if (m && !m.refreshing) { app.meta = m; return finishRefresh(m.latestRun); }
    await new Promise((r) => setTimeout(r, 2000));
  }
}
function endRefreshUi() {
  app.refreshing = false;
  $('#refreshBtn').classList.remove('spinning');
  $('#progress i').style.width = '100%';
  setTimeout(() => { $('#progress').classList.remove('on'); $('#progress i').style.width = '0'; }, 400);
}
async function finishRefresh(run) {
  if (!app.refreshing) return;
  endRefreshUi();
  $('#newPill').hidden = true;
  await loadMeta();
  await render({ quiet: true });
  if (run?.static) return toast(`Latest sweep loaded · ${ago(app.meta?.lastRefreshAt)} · auto every ~10 min`);
  if (run) toast(run.failed && !run.ok ? `Sweep failed — ${run.failed} sources unreachable` : `Radar swept · ${run.added} new · ${run.changed} updated${run.failed ? ` · ${run.failed} sources failed` : ''}`);
}

function connectEvents() {
  if (!('EventSource' in window)) return;
  try {
    const es = new EventSource('api/events');
    app.es = es;
    let total = 0;
    let done = 0;
    es.addEventListener('refresh:start', (e) => {
      const d = JSON.parse(e.data);
      total = d.total; done = 0;
      if (!app.refreshing && app.meta) app.meta.refreshing = true;
      $('#progress').classList.add('on');
      updateLive();
    });
    es.addEventListener('source', () => {
      done++;
      const pct = total ? Math.round((done / total) * 90) : 50;
      $('#progress i').style.width = `${pct}%`;
      app.progressText = `Sweeping ${done}/${total}`;
      updateLive();
    });
    es.addEventListener('refresh:done', (e) => {
      const { run } = JSON.parse(e.data);
      if (app.refreshing) finishRefresh(run);
      else {
        $('#progress i').style.width = '100%';
        setTimeout(() => { $('#progress').classList.remove('on'); $('#progress i').style.width = '0'; }, 400);
        loadMeta().then(() => onRemoteRefresh(run));
      }
    });
    es.onerror = () => {};
  } catch {}
}

// ---------------- events ----------------
document.addEventListener('click', async (e) => {
  if (app.selectMode) { // picking stories for a reel: any tap on a story card picks it
    const card = e.target.closest('#view [data-story]');
    if (card && !e.target.closest('[data-action]')) { e.preventDefault(); e.stopPropagation(); return togglePick(card.dataset.story); }
  }
  const t = e.target.closest('[data-save],[data-action],[data-story],[data-brand],[data-source],[data-del-source],[data-jump],[data-rmbrand],[data-cat],[data-post],[data-fmt],[data-seg],[data-game],[data-video],[data-reel],.src-link');
  if (!t) return;
  if (t.classList.contains('src-link')) return; // let links inside cards open normally
  if (t.dataset.reel) return togglePick(t.dataset.reel);
  if (t.dataset.seg) { if (!app.show) return; app.tvStarted = true; setLive(false); app.show.stop(); app.show.play(Number(t.dataset.seg)); if (t.tagName !== 'P') window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  if (t.dataset.game) return openGame(t.dataset.game);
  if (t.dataset.video) return openVideo(t.dataset.video, t.dataset.vtitle || 'Highlights');
  if (t.dataset.post) { e.preventDefault(); e.stopPropagation(); return openPostStudio({ ids: [t.dataset.post] }); }
  if (t.dataset.fmt) return openPostStudio({ ...postState, format: t.dataset.fmt });
  if (t.dataset.jump) {
    const el = document.getElementById(t.dataset.jump);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - ($('.topbar').offsetHeight + $('#catnav').offsetHeight + 8), behavior: 'smooth' });
    return;
  }
  if (t.dataset.rmbrand) { prefs.customBrands = prefs.customBrands.filter((b) => b !== t.dataset.rmbrand); saveCustom(); return render({ quiet: true }); }
  if (t.dataset.cat) { const c = t.dataset.cat; prefs.cats.has(c) ? prefs.cats.delete(c) : prefs.cats.add(c); saveCats(); t.classList.toggle('on', prefs.cats.has(c)); return; }
  if (t.dataset.save) { e.preventDefault(); e.stopPropagation(); return toggleSave(t.dataset.save); }
  if (t.dataset.brand) {
    const id = t.dataset.brand;
    prefs.brands.has(id) ? prefs.brands.delete(id) : prefs.brands.add(id);
    saveBrands();
    t.classList.toggle('on', prefs.brands.has(id));
    return;
  }
  if (t.dataset.source) {
    const enabled = t.dataset.enabled !== 'true';
    await api(`/api/sources/${encodeURIComponent(t.dataset.source)}`, { method: 'PATCH', body: { enabled } });
    t.dataset.enabled = String(enabled);
    t.classList.toggle('on', enabled);
    return toast(enabled ? 'Source enabled' : 'Source disabled');
  }
  if (t.dataset.delSource) {
    await api(`/api/sources/${encodeURIComponent(t.dataset.delSource)}`, { method: 'DELETE' });
    return render({ quiet: true });
  }
  if (t.dataset.story) {
    if (e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    return openStory(t.dataset.story);
  }
  const a = t.dataset.action;
  if (a === 'close') return closeSheet();
  if (a === 'tv-start' || a === 'tv-live') return tvGoLive();
  if (a === 'reel-make') return runReel();
  if (a === 'game-reel') return runGameReel(t.dataset.id);
  if (a === 'hl-mode') return openHighlightMode(t.dataset.id);
  if (a === 'rm-mode') return openReelMode(t.dataset.id);
  if (a === 'rm-start') return rmPlay(0);
  if (a === 'hl-start') return hlPlay(0);
  if (a === 'hl-next') return hlPlay((app.hl?.i ?? -1) + 1);
  if (a === 'hl-prev') return hlPlay(Math.max(0, (app.hl?.i ?? 1) - 1));
  if (a === 'hl-pick') return hlPlay(Number(t.dataset.i));
  if (a === 'select-on') { app.selectMode = true; reelFab(); markPicked(); toast('Tap stories to pick them for your reel'); return; }
  if (a === 'select-off') { app.selectMode = false; reelFab(); markPicked(); return; }
  if (a === 'reel-clear') { prefs.reel = []; saveReel(); return; }
  if (a === 'reel-add') { const s2 = app.stories.get(t.dataset.id); if (s2 && !prefs.reel.some((x) => x.id === s2.id)) { prefs.reel.push(s2); saveReel(); } toast(`Added to reel (${prefs.reel.length}) — open Reel Studio to make it`); return; }
  if (a === 'road-map') return openRoadMap();
  if (a === 'st-vid' || a === 'st-save') {
    const name = t.dataset.st; const sl = app.rw?.stateSlugs?.[name]; const v = app.rw?.stateVideos?.[sl]; if (!v) return;
    if (a === 'st-save') return saveFile(v.video, `smash-roads-${sl}.mp4`, 'video/mp4');
    openSheetHtml(`<div class="video-wrap tall"><video src="${esc(v.video)}" controls playsinline autoplay></video></div><div class="content"><h2>${esc(name)} roads</h2><p class="muted">Updated ${esc(ago(v.at))}</p><div class="actions"><button class="btn primary" data-action="st-save" data-st="${esc(name)}">⬇ Save video</button></div></div>`);
    return;
  }
  if (a === 'rm-state') { const b = app.roadStates?.[t.dataset.st]; if (b && app.lmap) app.lmap.fitBounds(b, { padding: [20, 20] }); return; }
  if (a === 'rw-save') { if (app.rw?.video) saveFile(app.rw.video, `smash-road-watch-${(app.rw.videoAt || '').slice(0, 16).replace(/[:T]/g, '-')}.mp4`, 'video/mp4'); return; }
  if (a === 'fz-save') { const r = app.recaps?.find((x) => x.id === t.dataset.id); if (!r) return; return r.fantasyPage ? saveFile(r.fantasyPage, `smash-fantasy-${r.away.abbr}-at-${r.home.abbr}.mp4`.toLowerCase(), 'video/mp4') : window.open(r.fantasyVideo, '_blank'); }
  if (a === 'recap-play' || a === 'recap-save') {
    const r = app.recaps?.find((x) => x.id === t.dataset.id); if (!r) return;
    const src = r.page || r.video;
    if (a === 'recap-save') return r.page ? saveFile(r.page, `smash-news-${r.away.abbr}-at-${r.home.abbr}.mp4`.toLowerCase(), 'video/mp4') : window.open(r.video, '_blank');
    openSheetHtml(`<div class="video-wrap tall"><video src="${esc(src)}" controls playsinline autoplay></video></div><div class="content"><h2>${esc(r.title)}</h2><div class="actions"><button class="btn primary" data-action="recap-save" data-id="${esc(r.id)}">⬇ Save video</button></div></div>`);
    return;
  }
  if (a === 'file-share') { if (app.pendingFile) navigator.share({ files: [app.pendingFile], title: app.pendingFile.name }).catch(() => {}); return; }
  if (a === 'tv-script') { const sh = app.tvShow; if (sh) openScript(showScript(sh), `smash-news-script-${(sh.slot || 'show').replace(/[:T]/g, '-')}.txt`, clock(sh.startsAt || sh.createdAt)); return; }
  if (a === 'script-copy') { navigator.clipboard?.writeText(app.scriptText || '').then(() => toast('Script copied ✓'), () => toast('Long-press the text to copy')); return; }
  if (a === 'script-save') { saveFile(new Blob([app.scriptText || ''], { type: 'text/plain' }), app.scriptName || 'smash-news-script.txt', 'text/plain'); return; }
  if (a === 'vid-play' || a === 'vid-save' || a === 'vid-script') {
    const v = app.tvVideos?.[Number(t.dataset.k)]; if (!v) return;
    const base = `smash-news-${v.slot.replace(/[:T]/g, '-')}`;
    if (a === 'vid-save') return saveFile(v.video, `${base}.mp4`, 'video/mp4');
    if (a === 'vid-script') { fetch(v.script).then((r) => r.text()).then((txt) => openScript(txt, `${base}.txt`, clock(v.startsAt))).catch(() => toast('Script not available')); return; }
    if (app.show?.playing) { app.show.pause(); setLive(false); }
    openSheetHtml(`<div class="video-wrap tall"><video src="${esc(v.video)}" controls playsinline autoplay preload="metadata"></video></div><div class="content"><h2>${esc(clock(v.startsAt))} SMASH NEWS show</h2><div class="actions"><button class="btn primary" data-action="vid-save" data-k="${esc(t.dataset.k)}">⬇ Save video</button>${v.script ? `<button class="btn" data-action="vid-script" data-k="${esc(t.dataset.k)}">📄 Save script</button>` : ''}</div></div>`);
    return;
  }
  if (a === 'lion-play') { if (!app.show) return; if (app.show.playing) { app.show.pause(); setLive(false); return; } if (!app.tvStarted) return tvGoLive(); app.tvStarted = true; app.show.play(app.show.i); return; }
  if (a === 'lion-next') { app.tvStarted = true; setLive(false); return app.show?.next(); }
  if (a === 'lion-prev') { app.tvStarted = true; setLive(false); return app.show?.prev(); }
  if (a === 'tv-top') { if (!app.show) return; app.tvStarted = true; setLive(false); app.show.stop(); app.show.play(0); return; }
  if (a === 'tv-cc') { prefs.tvCC = prefs.tvCC === false; LS.set('sr.tvCC', prefs.tvCC); t.classList.toggle('on', prefs.tvCC); $('#lsCaption')?.classList.toggle('off', !prefs.tvCC); return; }
  if (a === 'tv-mode') { const on = !document.body.classList.contains('tv-mode'); document.body.classList.toggle('tv-mode', on); if (on && !app.show?.playing) tvGoLive(); return; }
  if (a === 'recap') return openPostStudio({ recap: true });
  if (a === 'recap-week') return openPostStudio({ recap: true, weekly: true });
  if (a === 'share-post') return sharePost();
  if (a === 'copy-caption') { await copyText($('#postCaption').value); return toast('Caption copied'); }
  if (a === 'close-nav') return closeSheet();
  if (a === 'more') return openMore();
  if (a === 'refresh') return refreshNow();
  if (a === 'reload') return render();
  if (a === 'nearby') { prefs.nearby = !prefs.nearby; LS.set('sr.nearby', prefs.nearby); return render({ quiet: true }); }
  if (a === 'dupage-foryou') { prefs.dupageInForYou = !prefs.dupageInForYou; LS.set('sr.dupageForYou', prefs.dupageInForYou); t.classList.toggle('on', prefs.dupageInForYou); return; }
  if (a === 'share') {
    const s = app.stories.get(t.dataset.id);
    if (!s) return;
    if (navigator.share) return navigator.share({ title: s.title, text: `${s.title} — via SMASH NEWS`, url: s.url }).catch(() => {});
    await navigator.clipboard?.writeText(s.url).catch(() => {});
    return toast('Link copied');
  }
  if (a === 'live-search') {
    t.disabled = true;
    t.textContent = 'Searching the web…';
    try {
      const r = await api('/api/search/live', { method: 'POST', body: { q: t.dataset.q } });
      toast(r.errors?.length === 2 ? 'Live search couldn\'t reach the news providers' : `Found ${r.added} new stories`);
      await render({ quiet: true });
    } catch (err) { toast(err.message); t.disabled = false; t.textContent = '🌐 Search the web live'; }
  }
});
$('#sheetBackdrop').addEventListener('click', closeSheet);
$('#refreshBtn').addEventListener('click', refreshNow);
$('#livePill').addEventListener('click', () => (location.hash = '#/sources'));
$('#newPill').addEventListener('click', async () => { $('#newPill').hidden = true; await render({ quiet: true }); window.scrollTo({ top: 0, behavior: 'smooth' }); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
document.addEventListener('submit', async (e) => {
  if (e.target.id === 'searchForm') {
    e.preventDefault();
    location.hash = `#/search?q=${encodeURIComponent($('#q').value.trim())}`;
  }
  if (e.target.id === 'addBrand') {
    e.preventDefault();
    const v = new FormData(e.target).get('b').toString().trim();
    if (v && !prefs.customBrands.some((b) => b.toLowerCase() === v.toLowerCase())) { prefs.customBrands.push(v); saveCustom(); toast(`Added ${v}`); }
    return render({ quiet: true });
  }
  if (e.target.id === 'addSource') {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api('/api/sources', { method: 'POST', body: Object.fromEntries(f) });
      toast('Feed added — it will be checked on the next sweep');
      render({ quiet: true });
    } catch (err) { toast(err.message); }
  }
});
document.addEventListener('change', (e) => { if (e.target.id === 'statePick') location.hash = `#/local?state=${encodeURIComponent(e.target.value)}`; });
let searchTimer;
document.addEventListener('input', (e) => {
  if (e.target.id !== 'q') return;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const v = e.target.value.trim();
    if (v.length >= 2) history.replaceState(null, '', `#/search?q=${encodeURIComponent(v)}`), render({ quiet: true }).then(() => { const i = $('#q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } });
  }, 350);
});
// Swipe the sheet down to close (mobile)
(() => {
  let y0 = null;
  const sheet = $('#sheet');
  sheet.addEventListener('touchstart', (e) => { y0 = sheet.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
  sheet.addEventListener('touchend', (e) => { if (y0 != null && e.changedTouches[0].clientY - y0 > 90) closeSheet(); y0 = null; }, { passive: true });
})();

// broken images → category art
window.__phFix = () => document.querySelectorAll('.ph-fallback').forEach((el) => {
  const host = el.closest('[data-story]');
  const s = host && app.stories.get(host.dataset.story);
  el.outerHTML = s ? placeholder(s) : '<div class="ph"></div>';
});

window.addEventListener('hashchange', () => { closeSheet(); render(); });
window.addEventListener('online', () => { $('#offlineBanner').hidden = true; loadMeta(); render({ quiet: true }); });
window.addEventListener('offline', () => { $('#offlineBanner').hidden = false; updateLive(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') loadMeta(); });

// ---------------- boot ----------------
(async function boot() {
  if (!navigator.onLine) $('#offlineBanner').hidden = false;
  await detectMode();
  await loadMeta();
  await render();
  const sp = document.getElementById('splash');
  if (sp) { sp.classList.add('out'); setTimeout(() => sp.remove(), 500); }
  if (app.mode === 'server') connectEvents();
  setInterval(async () => { if (app.mode === 'static') await loadStatic(true).catch(() => {}); loadMeta(); }, app.mode === 'static' ? 180e3 : 60e3);
  setInterval(() => { updateLive(); document.querySelectorAll('time[datetime]').forEach((t) => (t.textContent = ago(t.getAttribute('datetime')))); }, 30e3);
  if ('serviceWorker' in navigator) {
    // always pick up the newest version: check on open + when coming back, and reload once when it lands
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
      reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    }).catch(() => {});
    let reloaded = false;
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
  }
  window.addEventListener('error', (e) => toast(`Something broke: ${e.message}`));
  window.addEventListener('unhandledrejection', (e) => toast(`Something broke: ${e.reason?.message || e.reason}`));
})();
