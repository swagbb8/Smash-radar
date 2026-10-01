// Live road work zones & closures from official state DOT feeds (USDOT Work Zone Data Exchange, WZDx).
// The USDOT registry lists every public feed; we use the active ones that don't need an API key.
import { fetchText } from './collector.js';

const REGISTRY = 'https://data.transportation.gov/api/views/69qe-yiui/rows.csv?accessType=DOWNLOAD';
const STATE_FIX = { 'new hampshire/vermont/maine': 'New England', nps: null, 'n/a': null };
const title = (s) => String(s || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

function parseCsv(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; } else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const head = rows.shift().map((h) => h.trim());
  return rows.filter((r) => r.length > 2).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
}

export async function wzdxFeeds() {
  const rows = parseCsv((await fetchText(REGISTRY, { timeout: 20000, maxBytes: 2_000_000 })).text);
  const key = (r, re) => r[Object.keys(r).find((k) => re.test(k))] || '';
  return rows.map((r) => ({
    state: key(r, /^state$/i), name: key(r, /issuing|feedname/i), url: key(r, /^url$/i),
    format: key(r, /^format$/i), version: key(r, /^version$/i), active: /true/i.test(key(r, /^active$/i)), needKey: /true/i.test(key(r, /apikey/i)),
  })).filter((f) => f.active && !f.needKey && /^https?:/.test(f.url) && !/YOUR|INSERT|<key>|%3ckey/i.test(f.url));
}

const simplify = (pts, max = 40) => { if (pts.length <= max) return pts; const step = (pts.length - 1) / (max - 1); return Array.from({ length: max }, (_, i) => pts[Math.round(i * step)]); };
const r5 = (x) => Math.round(x * 1e5) / 1e5;

function coordsOf(geom) {
  if (!geom) return [];
  const flat = (c, d) => (d === 0 ? [c] : c.flatMap((x) => flat(x, d - 1)));
  const depth = { Point: 0, MultiPoint: 1, LineString: 1, MultiLineString: 2, Polygon: 2, MultiPolygon: 3 }[geom.type];
  if (depth == null) return [];
  return flat(geom.coordinates, depth).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])).map((p) => [r5(p[0]), r5(p[1])]);
}

/** Normalize one WZDx (v3/v4) or CWZ feature. */
export function normalizeEvent(f, feed, now = Date.now()) {
  const p = f.properties || {};
  const core = p.core_details || p;
  const roads = core.road_names || (p.road_name ? [p.road_name] : core.road_name ? [core.road_name] : []);
  const start = p.start_date || p.start_date_time || core.start_date || null;
  const end = p.end_date || p.end_date_time || core.end_date || null;
  const s = start ? Date.parse(start) : null, e = end ? Date.parse(end) : null;
  if (e && e < now) return null;                       // already over
  if (s && s > now + 24 * 3600e3) return null;          // starts more than a day from now
  const impact = p.vehicle_impact || p.impact || '';
  const pts = simplify(coordsOf(f.geometry));
  if (!pts.length) return null;
  const lons = pts.map((x) => x[0]), lats = pts.map((x) => x[1]);
  const typ = (core.event_type || p.event_type || '').toLowerCase();
  const closed = /all-lanes-closed/i.test(impact) || /detour/i.test(typ) || /\b(road|bridge|ramp|street|highway) (is )?closed\b|full closure|detour/i.test(core.description || '');
  const desc = String(core.description || p.description || '').replace(/\s+/g, ' ').trim().slice(0, 220);
  return {
    id: `${feed.name}|${core.data_source_id || ''}|${f.id || p.road_event_id || pts[0].join(',')}`,
    state: feed.stateName, source: feed.name.split('/')[0],
    type: closed ? 'closure' : 'construction', impact: impact.replace(/-/g, ' '),
    road: roads.filter(Boolean).slice(0, 2).join(' / ') || null, direction: core.direction || p.direction || null,
    from: p.beginning_cross_street || null, to: p.ending_cross_street || null,
    desc, start, end, active: !s || s <= now,
    lanes: (p.lanes || []).filter((l) => /closed/i.test(l.status || '')).length || null,
    workers: p.worker_presence?.are_workers_present ?? null,
    coords: pts, center: [r5(lons.reduce((a, b) => a + b) / lons.length), r5(lats.reduce((a, b) => a + b) / lats.length)],
    bbox: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)],
  };
}

const rank = (e) => (e.type === 'closure' ? 0 : 1) * 10 + (e.active ? 0 : 5) + (/interstate|^I-|\bI \d|US-|US \d/i.test(e.road || '') ? 0 : 2);

/** Fetch every public feed in parallel; returns { states: {name: [events]}, feeds: [...status] }. */
export async function fetchWorkZones({ perState = 40, now = Date.now() } = {}) {
  const feeds = await wzdxFeeds();
  const out = { updatedAt: new Date(now).toISOString(), states: {}, feeds: [] };
  await Promise.all(feeds.map(async (feed) => {
    const st = STATE_FIX[feed.state.toLowerCase()] !== undefined ? STATE_FIX[feed.state.toLowerCase()] : title(feed.state);
    if (!st) return;
    feed.stateName = st;
    const t0 = Date.now();
    try {
      const txt = (await fetchText(feed.url, { timeout: 25000, maxBytes: 60_000_000, headers: { accept: 'application/geo+json, application/json' } })).text;
      const j = JSON.parse(txt);
      const feats = j.features || j.road_events || [];
      const evs = feats.map((f) => { try { return normalizeEvent(f, feed, now); } catch { return null; } }).filter(Boolean);
      (out.states[st] ||= []).push(...evs);
      out.feeds.push({ state: st, name: feed.name, ok: true, events: evs.length, ms: Date.now() - t0 });
    } catch (e) { out.feeds.push({ state: st, name: feed.name, ok: false, error: String(e.message).slice(0, 120) }); }
  }));
  for (const st of Object.keys(out.states)) {
    const seen = new Set();
    out.states[st] = out.states[st].filter((e) => { const k = `${e.road}|${e.center.join(',')}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => rank(a) - rank(b)).slice(0, perState);
    if (!out.states[st].length) delete out.states[st];
  }
  return out;
}
