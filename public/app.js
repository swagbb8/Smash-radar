// SMASH RADAR — client app (no build step). Hash-routed SPA, installable PWA.
const $ = (s, el = document) => el.querySelector(s);
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
  customBrands: LS.get('sr.customBrands', []),
  cats: new Set(LS.get('sr.cats', [])),
};
const saveCustom = () => LS.set('sr.customBrands', prefs.customBrands);
const saveCats = () => LS.set('sr.cats', [...prefs.cats]);
const saveBrands = () => LS.set('sr.brands', [...prefs.brands]);
const saveSaved = () => LS.set('sr.saved', prefs.saved);

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
  if (v === 'foryou') list = list.filter((s) => s.brandIds.some((b) => brandSet.has(b)) || (brandSet.has('dupage') && s.location));
  if (o.category) list = list.filter((s) => s.categories.includes(o.category));
  if (brandSet.size && v !== 'foryou') list = list.filter((s) => s.brandIds.some((b) => brandSet.has(b)));
  if (o.place) list = list.filter((s) => s.location?.places?.includes(o.place));
  if (o.incident) list = list.filter((s) => (o.incident === 'local' ? !s.location?.incident : s.location?.incident?.id === o.incident));
  if (o.q) {
    const terms = String(o.q).toLowerCase().split(/\s+/).filter(Boolean);
    list = list.filter((s) => { const hay = `${s.title} ${s.summary} ${s.brands.join(' ')} ${s.sourceName} ${s.location?.places?.join(' ') || ''} ${s.category}`.toLowerCase(); return terms.every((t) => hay.includes(t)); });
  }
  const chrono = ['dupage', 'today', 'week', 'breaking'].includes(v) || o.q;
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
  { r: 'daily', label: "Today's Radar", ic: '📡' },
  { r: 'breaking', label: 'Breaking', ic: '🔥', count: 'BREAKING', hot: true },
  { r: 'today', label: 'Today', ic: '🆕', count: 'NEW' },
  { r: 'week', label: 'This Week', ic: '📅' },
  { r: 'dupage', label: 'DuPage', ic: '📍', count: 'dupage' },
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
  if (m && !m.lastRefreshAt) return empty('📡', 'First sweep hasn\'t finished yet', 'SMASH RADAR is checking its sources for the first time. This usually takes under a minute.', '<button class="btn primary" data-action="refresh" style="max-width:240px;margin:auto">Refresh Now</button>');
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
    const all = await api(`/api/stories?${qs({ view: 'all', limit: 200 })}`);
    if (!all.stories.length) return top + (noDataYet() || empty('📡', 'Radar is clear', 'Nothing collected yet. Tap Refresh to sweep all sources.'));
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
    return top + hero(heroStory) + nav + built.map((b) => b[3]).join('');
  },

  async daily() {
    const all = (await api(`/api/stories?${qs({ view: 'all', limit: 200 })}`)).stories;
    const m = app.meta;
    const today = dayKey(Date.now());
    const fresh = all.filter((s) => dayKey(s.publishedAt || s.discoveredAt) === today || s.status === 'NEW' || s.status === 'BREAKING' || s.status === 'UPDATED');
    const pool = fresh.length >= 10 ? fresh : all;
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: TZ });
    let html = `<div class="daily-head"><div class="kick">Today's Radar</div><h2>${esc(dateStr)}</h2><p>${(m?.counts?.NEW || 0) + (m?.counts?.BREAKING || 0) + (m?.counts?.UPDATED || 0)} new or updated stories today · updated ${m?.lastRefreshAt ? esc(clock(m.lastRefreshAt)) : '—'}</p></div>`;
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

  async posts() {
    const all = (await api(`/api/stories?${qs({ view: 'all', limit: 200 })}`)).stories;
    if (!all.length) return viewHead('Post Studio') + (noDataYet() || empty('📸', 'Nothing to post yet', 'Posts appear after the first sweep.'));
    let html = viewHead('Post Studio', 'Turn any story into an Instagram post. Tap a story → Share → Instagram (or Save to Photos). The caption is copied for you.');
    const ap = app.meta?.autopost;
    html += `<div class="box"><h5>Instagram auto-post</h5>${ap?.last ? `On · ${ap.today} post${ap.today === 1 ? '' : 's'} today · last: ${esc(ap.last.kind === 'recap' ? 'Daily Recap' : 'story')} ${ago(ap.last.at)}` : 'Off — add your Instagram connection in the GitHub repo secrets to turn it on.'}${ap?.lastError ? `<div class="err" style="color:var(--breaking);font-size:12.5px;margin-top:4px">Last error: ${esc(ap.lastError.error)}</div>` : ''}</div>`;
    html += `<button class="recap-card" data-action="recap"><span class="big">📡</span><span><b>Daily Recap carousel</b><br><span class="muted">Cover slide + today's top 5 stories, ready to post as one carousel</span></span><span class="go">Make →</span></button>`;
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
    html += data.stories.length ? `<div class="grid" id="results">${data.stories.map(card).join('')}</div>` : `<div id="results">${empty('🔎', 'Nothing on the radar yet', 'Run a live web search to pull the newest coverage for this term into SMASH RADAR.')}</div>`;
    return html;
  },

  async sources() {
    const { sources, runs } = await api('/api/sources');
    const m = app.meta;
    const bad = sources.filter((s) => s.enabled && s.lastStatus === 'error');
    const sorted = [...sources].sort((a, b) => (b.lastStatus === 'error') - (a.lastStatus === 'error') || a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    const run = runs[0];
    let html = viewHead('Sources & Health', 'Every feed SMASH RADAR watches, when it was last checked, and whether it worked.');
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
function pickRecap(all) {
  const today = dayKey(Date.now());
  const pool = all.filter((x) => x.status !== 'EARLIER' && (dayKey(x.publishedAt || x.discoveredAt) === today || ['NEW', 'BREAKING', 'UPDATED'].includes(x.status)));
  const src = (pool.length >= 5 ? pool : all).slice().sort((a, b) => (b.imageUrl ? 8 : 0) + b.score - ((a.imageUrl ? 8 : 0) + a.score));
  const out = []; const cats = new Set();
  for (const x of src) { if (out.length >= 5) break; if (!cats.has(x.category)) { out.push(x); cats.add(x.category); } }
  for (const x of src) { if (out.length >= 5) break; if (!out.includes(x)) out.push(x); }
  return out;
}
async function openPostStudio({ ids = [], recap = false, format = 'feed' }) {
  postState = { ids, recap, format, files: [], caption: '' };
  const sheet = $('#sheet');
  sheet.innerHTML = `<div class="grab"></div><button class="close" data-action="close" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
    <div class="sheet-title">${recap ? 'Daily Recap' : 'Make a Post'}</div>
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
      const all = (await api(`/api/stories?${qs({ view: 'all', limit: 200 })}`)).stories;
      stories = pickRecap(all);
    } else {
      stories = await Promise.all(ids.map(async (id) => app.stories.get(id) || api(`/api/stories/${encodeURIComponent(id)}`)));
    }
    const canvases = recap
      ? [await postMod.renderRecapCover(stories, format), ...(await Promise.all(stories.map((x, i) => postMod.renderStoryPost(x, format, { slide: `${i + 2}/${stories.length + 1}` }))))]
      : await Promise.all(stories.map((x) => postMod.renderStoryPost(x, format)));
    const blobs = await Promise.all(canvases.map(postMod.toBlob));
    if (postState.ids !== ids || postState.format !== format || postState.recap !== recap) return; // superseded
    const stamp = new Date().toISOString().slice(0, 10);
    postState.files = blobs.map((b, i) => new File([b], `smash-radar-${stamp}-${recap ? 'recap' : (stories[0].id)}-${i + 1}.jpg`, { type: 'image/jpeg' }));
    postState.caption = recap ? postMod.recapCaption(stories) : postMod.captionFor(stories[0]);
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

function closeSheet() {
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
  const tabs = [['home', 'Home'], ['breaking', 'Breaking'], ['dupage', 'DuPage'], ['foryou', 'For You']];
  const inMore = !tabs.some(([r]) => r === app.route);
  $('#tabbar').innerHTML = tabs.map(([r, l]) => `<a href="#/${r}" class="${app.route === r ? 'active' : ''}">${ICONS[r]}<span>${l}</span>${r === 'breaking' && c.BREAKING ? `<span class="badge">${c.BREAKING}</span>` : ''}</a>`).join('') +
    `<button type="button" data-action="more" class="${inMore ? 'active' : ''}">${ICONS.more}<span>More</span></button>`;
  $('#pageTitle').textContent = TITLES[app.route] || 'SMASH RADAR';
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
  const items = [['posts', '📸', 'Post Studio'], ['daily', '📡', "Today's Radar"], ['today', '🆕', 'Today', c.NEW], ['week', '📅', 'This Week'], ['products', '📦', 'Products', c.products], ['deals', '💰', 'Deals', c.deals], ['recalls', '⚠️', 'Recalls', c.recalls], ['openings', '🏪', 'Openings'], ['brands', '⭐', 'My Brands', prefs.brands.size || ''], ['favorites', '🔖', 'Favorites', Object.keys(prefs.saved).length || ''], ['search', '🔎', 'Search'], ['sources', '🩺', 'Sources']];
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
  const t = e.target.closest('[data-save],[data-action],[data-story],[data-brand],[data-source],[data-del-source],[data-jump],[data-rmbrand],[data-cat],[data-post],[data-fmt],.src-link');
  if (!t) return;
  if (t.classList.contains('src-link')) return; // let links inside cards open normally
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
  if (a === 'recap') return openPostStudio({ recap: true });
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
    if (navigator.share) return navigator.share({ title: s.title, text: `${s.title} — via SMASH RADAR`, url: s.url }).catch(() => {});
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
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
