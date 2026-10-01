// Story engine: ingestion, duplicate detection, change tracking, status lifecycle, ranking, queries.
import { canonicalUrl, shortId, sha1, titleTokens, jaccard, truncate, domainOf, localDateKey } from './util.js';
import { verifyDupage } from './dupage.js';
import { isForeignOnly } from './usfilter.js';
import { COUNTIES } from './config.js';
import { detectIncident } from './dupage.js';
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const COUNTY_RX = Object.fromEntries(Object.entries(COUNTIES).map(([c, towns]) => [c, new RegExp(`\\b(${[`${c} County`, ...towns].map(esc).join('|')})\\b`)]));
// Region tag: county sources must actually mention the county or one of its towns.
function regionFor(source, text) {
  if (!source.region) return null;
  if (source.region.state) return { state: source.region.state };
  const c = source.region.county;
  if (!COUNTY_RX[c]?.test(text)) return undefined; // not really about that county → drop
  const inc = detectIncident(text);
  const roadsy = inc && ['crash', 'closure', 'construction', 'traffic', 'trees', 'police', 'fire', 'emergency', 'flooding', 'weather', 'outage', 'metra', 'missing'].includes(inc.id);
  return { state: 'Illinois', county: c, roads: !!(source.region.roads && roadsy), incident: inc || null };
}
const US_ONLY = () => process.env.US_ONLY !== 'off';
import { classify, whyItMatters, detectFlags, productDetails, recallDetails } from './classify.js';

const H = 3600e3;
const MAX_AGE_DAYS = { default: 7, dupage: 4, recalls: 30, news: 3 };
export const RETENTION_DAYS = Number(process.env.RETENTION_DAYS || 14);
const DUP_THRESHOLD = 0.7;

export function emptyState() {
  return { version: 1, stories: {}, sources: {}, runs: [], rejections: [], meta: { createdAt: new Date().toISOString() } };
}

const feedHash = (title, summary) => sha1(`${titleTokens(title).join(' ')}|${titleTokens(summary || '').join(' ')}`);

function buildDupIndex(state, now) {
  const idx = new Map(); // token -> Set(id)
  const cutoff = now - 72 * H;
  for (const s of Object.values(state.stories)) {
    const t = Date.parse(s.publishedAt || s.firstDiscoveredAt);
    if (t < cutoff) continue;
    for (const tok of s.tokens || []) {
      if (!idx.has(tok)) idx.set(tok, new Set());
      idx.get(tok).add(s.id);
    }
  }
  return idx;
}

function findDuplicate(state, idx, tokens) {
  if (tokens.length < 4) return null;
  const counts = new Map();
  for (const tok of tokens) for (const id of idx.get(tok) || []) counts.set(id, (counts.get(id) || 0) + 1);
  let best = null;
  let bestScore = 0;
  for (const [id, n] of counts) {
    if (n < 3) continue;
    const s = state.stories[id];
    const score = jaccard(tokens, s.tokens || []);
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return bestScore >= DUP_THRESHOLD ? best : null;
}

// Local incidents are covered by many outlets with very different headlines.
// Same incident type + same DuPage place + within 8h + some headline overlap = same event.
function findLocalIncidentDup(state, dupage, tokens, pubMs) {
  if (!dupage?.incident || !['confirmed', 'verified'].includes(dupage.status)) return null;
  const places = dupage.places.filter((p) => p !== 'DuPage County');
  if (!places.length) return null;
  let best = null;
  let bestScore = 0;
  for (const s of Object.values(state.stories)) {
    const loc = s.location;
    if (!loc?.incident || loc.incident.id !== dupage.incident.id) continue;
    if (!loc.places.some((p) => places.includes(p))) continue;
    const t = Date.parse(s.publishedAt || s.firstDiscoveredAt);
    if (Math.abs(t - pubMs) > 8 * H) continue;
    const score = jaccard(tokens, s.tokens || []);
    if (score >= 0.2 && score > bestScore) { best = s; bestScore = score; }
  }
  return best;
}

function indexAdd(idx, story) {
  for (const tok of story.tokens) {
    if (!idx.has(tok)) idx.set(tok, new Set());
    idx.get(tok).add(story.id);
  }
}

function meaningfulChange(a = '', b = '') {
  if (a === b) return false;
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (!ta.length && !tb.length) return false;
  return jaccard(ta, tb) < 0.9;
}

/**
 * Merge a batch of raw feed items from one source into state.
 * Returns ingestion stats.
 */
export function ingest(state, items, source, nowMs = Date.now()) {
  const nowIso = new Date(nowMs).toISOString();
  const stats = { fetched: items.length, added: 0, changed: 0, seen: 0, duplicates: 0, rejected: 0, stale: 0, foreign: 0 };
  const idx = buildDupIndex(state, nowMs);
  const maxAge = (MAX_AGE_DAYS[source.category] || MAX_AGE_DAYS.default) * 24 * H;

  for (const item of items) {
    const pub = item.publishedAt ? Date.parse(item.publishedAt) : null;
    if (pub && pub > nowMs + 6 * H) item.publishedAt = nowIso; // future-dated feed junk
    if (!item.nws && pub && nowMs - pub > maxAge) { stats.stale++; continue; }
    if (item.expiresAt && Date.parse(item.expiresAt) < nowMs) { stats.stale++; continue; }

    if (!item.nws && US_ONLY() && isForeignOnly(item.title, item.summary, source.category)) { stats.foreign++; continue; }
    const region = regionFor(source, `${item.title}. ${item.summary || ''}`);
    if (region === undefined) { stats.rejected++; continue; }
    const url = canonicalUrl(item.link);
    const dupage = verifyDupage({ title: item.title, summary: item.summary, url: item.link, publisher: item.publisher || source.name, sourceId: source.id, nws: item.nws });
    if (source.category === 'dupage' && (dupage.status === 'none' || dupage.status === 'rejected')) {
      stats.rejected++;
      state.rejections.unshift({ at: nowIso, sourceId: source.id, title: item.title, url: item.link, reason: dupage.reason });
      continue;
    }

    // Identity: NWS updates reference the alert they replace.
    let id = shortId(item.nws ? `nws:${item.guid}` : url);
    if (item.nws?.references?.length) {
      const prev = Object.values(state.stories).find((s) => s.alertIds && s.alertIds.some((a) => item.nws.references.includes(a)));
      if (prev) id = prev.id;
    }

    const hash = feedHash(item.title, item.summary);
    const existing = state.stories[id];
    if (existing) {
      existing.lastSeenAt = nowIso;
      existing.seenCount = (existing.seenCount || 1) + 1;
      if (item.nws && !existing.alertIds.includes(item.guid)) existing.alertIds.push(item.guid);
      if (existing.feedHash !== hash) {
        const change = { at: nowIso };
        if (meaningfulChange(existing.title, item.title)) change.title = { from: existing.title, to: item.title };
        if (meaningfulChange(existing.feedSummary, item.summary)) change.summary = { from: truncate(existing.feedSummary || '', 400), to: truncate(item.summary || '', 400) };
        existing.feedHash = hash;
        if (change.title || change.summary) {
          existing.changes = [change, ...(existing.changes || [])].slice(0, 10);
          existing.lastChangedAt = nowIso;
          existing.title = item.title;
          existing.tokens = titleTokens(item.title);
          existing.feedSummary = item.summary || existing.feedSummary;
          if (item.summary && !existing.enrichedSummary) existing.summary = truncate(item.summary, 420);
          if (item.updatedAt) existing.updatedAt = item.updatedAt;
          stats.changed++;
          continue;
        }
      }
      if (!existing.imageUrl && item.imageUrl) existing.imageUrl = item.imageUrl;
      stats.seen++;
      continue;
    }

    const tokens = titleTokens(item.title);
    const dup = item.nws ? null : (findDuplicate(state, idx, tokens) || findLocalIncidentDup(state, dupage, tokens, pub || nowMs));
    if (dup) {
      dup.lastSeenAt = nowIso;
      // Track each merged copy so an update from ANY outlet shows up as "What changed?"
      dup.variants ||= {};
      const prev = dup.variants[url];
      if (prev && prev.hash !== hash && (meaningfulChange(prev.summary, item.summary) || meaningfulChange(prev.title, item.title))) {
        const change = { at: nowIso, via: item.publisher || source.name };
        if (meaningfulChange(prev.title, item.title)) change.title = { from: prev.title, to: item.title };
        if (meaningfulChange(prev.summary, item.summary)) change.summary = { from: truncate(prev.summary || '', 400), to: truncate(item.summary || '', 400) };
        dup.changes = [change, ...(dup.changes || [])].slice(0, 10);
        dup.lastChangedAt = nowIso;
        if (item.summary && !dup.enrichedSummary) { dup.summary = truncate(item.summary, 420); dup.feedSummary = item.summary; }
        dup.variants[url] = { hash, title: item.title, summary: truncate(item.summary || '', 400) };
        stats.changed++;
        continue;
      }
      if (!prev) {
        dup.variants[url] = { hash, title: item.title, summary: truncate(item.summary || '', 400) };
        if (Object.keys(dup.variants).length > 15) delete dup.variants[Object.keys(dup.variants)[0]];
      }
      const already = canonicalUrl(dup.link || dup.url) === url || (dup.alsoReportedBy || []).some((r) => canonicalUrl(r.url) === url);
      const samePublisher = domainOf(dup.url) === domainOf(item.publisherUrl || url) || (item.publisher && item.publisher === dup.sourceName);
      if (!already && !samePublisher) {
        dup.alsoReportedBy = [...(dup.alsoReportedBy || []), { name: item.publisher || source.name, url: item.link, sourceId: source.id }].slice(0, 12);
      }
      if (region && !dup.region) dup.region = region;
      if (region?.roads && dup.region && !dup.region.roads) dup.region.roads = true;
      if (!dup.imageUrl && item.imageUrl) dup.imageUrl = item.imageUrl;
      if (!dup.summary && item.summary) { dup.summary = truncate(item.summary, 420); dup.feedSummary = item.summary; }
      if (source.official && !dup.official) { dup.official = true; dup.officialUrl = item.link; }
      stats.duplicates++;
      continue;
    }

    const cls = classify({ title: item.title, summary: item.summary, source, dupage });
    const location = cls.categories.includes('dupage') ? {
      status: dupage.status, places: dupage.places, roads: dupage.roads, reason: dupage.reason, incident: dupage.incident,
    } : null;
    const story = {
      id,
      url,
      link: item.link,
      title: item.title,
      summary: truncate(item.summary || '', 420),
      feedSummary: item.summary || '',
      instruction: item.instruction || undefined,
      whyItMatters: whyItMatters({ category: cls.category, brands: cls.brands, flags: cls.flags, dupage: location ? dupage : null, official: source.official, nws: item.nws, sourceName: source.name }),
      imageUrl: item.imageUrl || null,
      category: cls.category,
      categories: cls.categories,
      brands: cls.brands,
      brandIds: cls.brandIds,
      flags: cls.flags,
      location,
      region: region || undefined,
      sourceId: source.id,
      sourceName: item.publisher || source.name,
      sourceDomain: domainOf(item.publisherUrl || item.link),
      feedName: source.name,
      official: !!source.official,
      reliability: source.reliability,
      publishedAt: item.publishedAt || null,
      updatedAt: item.updatedAt || null,
      expiresAt: item.expiresAt || null,
      firstDiscoveredAt: nowIso,
      lastSeenAt: nowIso,
      seenCount: 1,
      feedHash: hash,
      contentHash: sha1(`${item.title}|${item.summary || ''}`),
      tokens,
      alertIds: item.nws ? [item.guid] : undefined,
      nws: item.nws || undefined,
      alsoReportedBy: [],
      changes: [],
      needsEnrich: !item.nws && (!item.imageUrl || !item.summary || /bing\.com\/th/.test(item.imageUrl) || /news\.google\.com/.test(item.link)),
    };
    state.stories[id] = story;
    indexAdd(idx, story);
    stats.added++;
  }
  state.rejections = state.rejections.slice(0, 60);
  return stats;
}

// ---------------- status + ranking ----------------
export function computeStatus(s, nowMs = Date.now(), tz = 'America/Chicago') {
  const pub = s.publishedAt ? Date.parse(s.publishedAt) : Date.parse(s.firstDiscoveredAt);
  const age = nowMs - pub;
  if (s.expiresAt && Date.parse(s.expiresAt) < nowMs) return 'ENDED';
  const inc = s.location?.incident?.id;
  const urgentLocal = s.location && ['confirmed', 'verified'].includes(s.location.status) && ['fire', 'crash', 'emergency', 'metra'].includes(inc);
  const severeNws = s.nws && ['Extreme', 'Severe'].includes(s.nws.severity);
  if ((s.flags?.breaking && age < 3 * H) || (urgentLocal && age < 4 * H) || severeNws) return 'BREAKING';
  if (s.lastChangedAt && nowMs - Date.parse(s.lastChangedAt) < 24 * H) return 'UPDATED';
  const discoveredToday = localDateKey(s.firstDiscoveredAt, tz) === localDateKey(nowMs, tz);
  if (discoveredToday && age < 36 * H) return 'NEW';
  if (nowMs - Date.parse(s.lastSeenAt) < 48 * H) return 'ONGOING';
  return 'EARLIER';
}

export function score(s, nowMs = Date.now()) {
  const pub = s.publishedAt ? Date.parse(s.publishedAt) : Date.parse(s.firstDiscoveredAt);
  const hours = Math.max(0, (nowMs - pub) / H);
  let v = 100 / (1 + hours / 6);
  if (s.status === 'BREAKING') v += 60;
  if (s.status === 'UPDATED') v += 15;
  if (s.status === 'NEW') v += 10;
  if (s.imageUrl) v += 8;
  if (s.official) v += 6;
  v += Math.min(5, s.alsoReportedBy?.length || 0) * 4;
  if (s.location && ['confirmed', 'verified'].includes(s.location.status)) v += 10;
  return Math.round(v * 10) / 10;
}

// Public shape sent to clients.
export function present(s, nowMs = Date.now()) {
  const status = computeStatus(s, nowMs);
  const extra = detectFlags(`${s.title}. ${s.summary || ''}`, s.category);
  const flags = { ...s.flags, limited: extra.limited, discontinued: extra.discontinued, rumor: extra.rumor, leak: extra.leak };
  const tags = [];
  if (flags.recall) tags.push('RECALL');
  if (s.flags?.deal) tags.push('DEAL');
  if (s.flags?.product) tags.push('LAUNCH');
  if (s.flags?.opening) tags.push('OPENING');
  if (s.flags?.closing) tags.push('CLOSING');
  if (s.nws) tags.push('ALERT');
  if (flags.limited) tags.push('LIMITED');
  if (flags.discontinued) tags.push('DISCONTINUED');
  if (flags.leak) tags.push('LEAK');
  if (flags.rumor) tags.push('RUMOR');
  if ((s.alsoReportedBy?.length || 0) >= 3) tags.push('TRENDING');
  if (s.official) tags.push('OFFICIAL');
  const out = {
    id: s.id, title: s.title, summary: s.summary, whyItMatters: s.whyItMatters, imageUrl: s.imageUrl,
    url: s.link || s.url, canonicalUrl: s.url, region: s.region || null, category: s.category, categories: s.categories, brands: s.brands, brandIds: s.brandIds,
    location: s.location, status, tags, sourceName: s.sourceName, sourceDomain: s.sourceDomain, feedName: s.feedName, official: s.official,
    publishedAt: s.publishedAt, discoveredAt: s.firstDiscoveredAt, lastSeenAt: s.lastSeenAt, updatedAt: s.updatedAt, expiresAt: s.expiresAt,
    lastChangedAt: s.lastChangedAt || null, changes: s.changes || [], alsoReportedBy: s.alsoReportedBy || [], instruction: s.instruction,
    aiEnriched: !!s.aiEnriched,
    product: tags.includes('LAUNCH') || tags.includes('DEAL') || tags.includes('LIMITED') || tags.includes('DISCONTINUED') ? productDetails(s.title, s.feedSummary || s.summary) : null,
    recall: tags.includes('RECALL') ? recallDetails(s.title, s.feedSummary || s.summary || '', { sourceId: s.sourceId, brands: s.brands }) : null,
  };
  out.score = score({ ...s, status }, nowMs);
  return out;
}

const H24 = 24 * H;
const ROAD_SAFETY = new Set(['crash', 'closure', 'construction', 'traffic', 'trees', 'police', 'fire', 'emergency', 'flooding', 'weather', 'outage', 'metra', 'missing']);
export function queryStories(state, opts = {}, nowMs = Date.now()) {
  const { view = 'home', q = '', category = '', brands = '', place = '', incident = '', includeNearby = false, limit = 60, offset = 0 } = opts;
  const brandSet = new Set(String(brands).split(',').filter(Boolean));
  const today = localDateKey(nowMs);
  let list = Object.values(state.stories).map((s) => present(s, nowMs)).filter((s) => s.status !== 'ENDED');
  const pubMs = (s) => Date.parse(s.publishedAt || s.discoveredAt);

  switch (view) {
    case 'breaking': list = list.filter((s) => s.status === 'BREAKING' || (s.status === 'UPDATED' && nowMs - pubMs(s) < 12 * H)); break;
    case 'today': list = list.filter((s) => localDateKey(pubMs(s)) === today || (localDateKey(s.discoveredAt) === today && nowMs - pubMs(s) < 36 * H)); break;
    case 'week': list = list.filter((s) => nowMs - pubMs(s) < 7 * H24); break;
    case 'dupage': list = list.filter((s) => s.location && (includeNearby ? true : ['confirmed', 'verified'].includes(s.location.status))); break;
    case 'products': list = list.filter((s) => s.tags.includes('LAUNCH') || s.tags.includes('LIMITED') || s.tags.includes('DISCONTINUED')); break;
    case 'deals': list = list.filter((s) => s.tags.includes('DEAL')); break;
    case 'recalls': list = list.filter((s) => s.tags.includes('RECALL')); break;
    case 'openings': list = list.filter((s) => s.tags.includes('OPENING') || s.tags.includes('CLOSING')); break;
    case 'roads': list = list.filter((s) => (s.region?.roads) || (s.location && ['confirmed', 'verified'].includes(s.location.status) && ROAD_SAFETY.has(s.location.incident?.id))); break;
    case 'local': {
      const st = opts.state || 'Illinois';
      const co = opts.county || '';
      list = list.filter((s) => {
        if (co) return co === 'DuPage' ? (s.location && ['confirmed', 'verified'].includes(s.location.status)) : s.region?.county === co;
        if (st === 'Illinois') return s.region?.state === 'Illinois' || !!s.region?.county || !!(s.location && ['confirmed', 'verified'].includes(s.location.status));
        return s.region?.state === st;
      });
      break;
    }
    case 'foryou': list = list.filter((s) => s.brandIds.some((b) => brandSet.has(b)) || (brandSet.has('dupage') && s.location)); break;
    case 'brands': list = list.filter((s) => s.brandIds.length); break;
    default: break;
  }
  if (category) list = list.filter((s) => s.categories.includes(category));
  if (brandSet.size && view !== 'foryou') list = list.filter((s) => s.brandIds.some((b) => brandSet.has(b)));
  if (place) list = list.filter((s) => s.location?.places?.includes(place));
  if (incident) list = list.filter((s) => (incident === 'local' ? !s.location?.incident : s.location?.incident?.id === incident));
  if (q) {
    const terms = String(q).toLowerCase().split(/\s+/).filter(Boolean);
    list = list.filter((s) => {
      const hay = `${s.title} ${s.summary} ${s.brands.join(' ')} ${s.sourceName} ${s.location?.places?.join(' ') || ''} ${s.category}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }
  const chrono = ['dupage', 'today', 'week', 'breaking', 'roads', 'local'].includes(view) || q;
  list.sort(chrono ? (a, b) => pubMs(b) - pubMs(a) : (a, b) => b.score - a.score);
  return { total: list.length, stories: list.slice(Number(offset), Number(offset) + Math.min(200, Number(limit))) };
}

export function counts(state, nowMs = Date.now()) {
  const all = Object.values(state.stories).map((s) => present(s, nowMs)).filter((s) => s.status !== 'ENDED');
  const c = { total: all.length, BREAKING: 0, NEW: 0, UPDATED: 0, ONGOING: 0, EARLIER: 0, dupage: 0, recalls: 0, deals: 0, products: 0, byCategory: {} };
  for (const s of all) {
    c[s.status]++;
    if (s.location && ['confirmed', 'verified'].includes(s.location.status)) c.dupage++;
    if (s.tags.includes('RECALL')) c.recalls++;
    if (s.tags.includes('DEAL')) c.deals++;
    if (s.tags.includes('LAUNCH')) c.products++;
    for (const cat of s.categories) c.byCategory[cat] = (c.byCategory[cat] || 0) + 1;
  }
  return c;
}

export function prune(state, nowMs = Date.now()) {
  const cutoff = nowMs - RETENTION_DAYS * 24 * H;
  let removed = 0;
  for (const [id, s] of Object.entries(state.stories)) {
    const last = Math.max(Date.parse(s.lastSeenAt), Date.parse(s.publishedAt || 0) || 0);
    if (last < cutoff || (s.expiresAt && Date.parse(s.expiresAt) < nowMs - 24 * H) || (US_ONLY() && !s.nws && isForeignOnly(s.title, s.feedSummary || s.summary, s.category))) { delete state.stories[id]; removed++; }
  }
  const all = Object.values(state.stories);
  if (all.length > 5000) {
    all.sort((a, b) => Date.parse(a.lastSeenAt) - Date.parse(b.lastSeenAt));
    for (const s of all.slice(0, all.length - 5000)) { delete state.stories[s.id]; removed++; }
  }
  return removed;
}
