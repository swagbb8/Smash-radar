// Framework-agnostic API router shared by the Node server and the Netlify function.
import { APP, BRANDS, CATEGORIES, DUPAGE_PLACES, slug } from './config.js';
import { queryStories, present, counts } from './engine.js';
import { getSources, isRefreshing, refresh, liveSearch, tierMinutes } from './collector.js';
import { INCIDENT_TYPES } from './dupage.js';
import { buildBriefing, buildShow, showSlot } from './briefing.js';
let showCache = null;

const json = (status, body) => ({ status, body });
let nflCache = null;
async function nflCached() {
  if (nflCache && Date.now() - nflCache.at < 5 * 60e3) return nflCache.data;
  const { fetchNfl } = await import('./nfl.js');
  const data = await fetchNfl().catch((e) => ({ games: [], news: [], videos: [], errors: [e.message] }));
  nflCache = { at: Date.now(), data };
  return data;
}

export async function handleApi({ method, path, query = {}, body = {} }, ctx) {
  const { store } = ctx;
  const state = await store.load();
  const now = Date.now();
  const parts = path.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const [r0, r1, r2] = parts;

  if (method === 'GET' && r0 === 'health') {
    return json(200, { ok: true, time: new Date(now).toISOString(), stories: Object.keys(state.stories).length, lastRefreshAt: state.meta.lastRefreshAt || null, refreshing: isRefreshing() });
  }

  if (method === 'GET' && r0 === 'meta') {
    const sources = getSources(state);
    const health = sources.map((s) => state.sources[s.id]);
    const failing = sources.filter((s) => s.enabled && state.sources[s.id]?.lastStatus === 'error').length;
    return json(200, {
      app: APP,
      lastRefreshAt: state.meta.lastRefreshAt || null,
      lastFullRefreshAt: state.meta.lastFullRefreshAt || null,
      nextRefreshAt: ctx.nextRefreshAt ? ctx.nextRefreshAt() : null,
      refreshing: isRefreshing(),
      counts: counts(state, now),
      categories: CATEGORIES,
      intervals: { fast: tierMinutes('fast'), normal: tierMinutes('normal'), slow: tierMinutes('slow') },
      sourceSummary: {
        total: sources.length,
        enabled: sources.filter((s) => s.enabled).length,
        healthy: sources.filter((s) => s.enabled && ['ok', 'not-modified'].includes(state.sources[s.id]?.lastStatus)).length,
        failing,
        neverChecked: health.filter((h) => !h?.lastCheckedAt).length,
      },
      latestRun: state.runs?.[0] || null,
      ai: !!process.env.ANTHROPIC_API_KEY,
      mode: ctx.mode || 'node',
    });
  }

  if (method === 'GET' && r0 === 'stories' && !r1) {
    return json(200, queryStories(state, { ...query, includeNearby: query.nearby === '1' }, now));
  }
  if (method === 'GET' && r0 === 'stories' && r1) {
    const s = state.stories[r1];
    return s ? json(200, present(s, now)) : json(404, { error: 'Story not found' });
  }

  if (method === 'GET' && r0 === 'brands') {
    const c = {};
    for (const s of Object.values(state.stories)) for (const b of s.brandIds || []) c[b] = (c[b] || 0) + 1;
    return json(200, { brands: BRANDS.map((b) => ({ id: b.id, name: b.name, category: b.category, count: c[b.id] || 0 })) });
  }

  if (method === 'GET' && r0 === 'dupage') {
    const placeCounts = {};
    const incCounts = {};
    for (const s of Object.values(state.stories)) {
      const presented = present(s, now);
      if (!s.location || presented.status === 'ENDED' || !['confirmed', 'verified'].includes(s.location.status)) continue;
      for (const p of s.location.places) placeCounts[p] = (placeCounts[p] || 0) + 1;
      const k = s.location.incident?.id || 'local';
      incCounts[k] = (incCounts[k] || 0) + 1;
    }
    return json(200, {
      places: DUPAGE_PLACES.filter((p) => p.tier === 'core').map((p) => ({ name: p.name, count: placeCounts[p.name] || 0 })),
      incidents: [...INCIDENT_TYPES.map(([id, label]) => ({ id, label, count: incCounts[id] || 0 })), { id: 'local', label: 'Local News', count: incCounts.local || 0 }],
      rejected: (state.rejections || []).slice(0, 25),
    });
  }

  if (r0 === 'sources') {
    if (method === 'GET') {
      const list = getSources(state).map((s) => {
        const h = state.sources[s.id] || {};
        return {
          id: s.id, name: s.name, url: s.url, type: s.type, category: s.category, tier: s.tier, intervalMinutes: tierMinutes(s.tier),
          official: !!s.official, reliability: s.reliability, enabled: s.enabled !== false, custom: !!s.custom,
          lastCheckedAt: h.lastCheckedAt || null, lastSuccessAt: h.lastSuccessAt || null, lastError: h.lastError || null,
          lastStatus: h.lastStatus || 'pending', consecutiveFailures: h.consecutiveFailures || 0, lastItemCount: h.lastItemCount ?? null,
          lastAdded: h.lastAdded ?? null, lastRejected: h.lastRejected ?? null, totalAdded: h.totalAdded || 0, latencyMs: h.latencyMs ?? null,
        };
      });
      return json(200, { sources: list, runs: (state.runs || []).slice(0, 15) });
    }
    if (method === 'PATCH' && r1) {
      state.sourceOverrides ||= {};
      state.sourceOverrides[r1] = { ...(state.sourceOverrides[r1] || {}), enabled: !!body.enabled };
      await store.save(state);
      return json(200, { ok: true });
    }
    if (method === 'POST' && !r1) {
      const url = String(body.url || '').trim();
      if (!/^https?:\/\//.test(url)) return json(400, { error: 'A valid http(s) feed URL is required' });
      const cat = CATEGORIES.some((c) => c.id === body.category) ? body.category : 'news';
      const src = { id: `custom-${slug(body.name || url).slice(0, 40)}`, name: String(body.name || url).slice(0, 80), url, category: cat, tier: ['fast', 'normal', 'slow'].includes(body.tier) ? body.tier : 'normal', type: 'rss', official: !!body.official, reliability: 4, custom: true };
      state.customSources = [...(state.customSources || []).filter((s) => s.id !== src.id), src];
      await store.save(state);
      return json(201, src);
    }
    if (method === 'DELETE' && r1) {
      state.customSources = (state.customSources || []).filter((s) => s.id !== r1);
      await store.save(state);
      return json(200, { ok: true });
    }
  }

  if (method === 'POST' && r0 === 'refresh') {
    const force = body.force !== false;
    if (ctx.runRefresh) {
      const p = ctx.runRefresh({ force, trigger: 'manual' });
      if (query.wait === '1' || body.wait) return json(200, { ok: true, run: await p });
      return json(202, { ok: true, started: true });
    }
    const run = await refresh(store, { force, trigger: 'manual', deadlineMs: ctx.deadlineMs });
    return json(200, { ok: true, run });
  }

  if (method === 'POST' && r0 === 'search' && r1 === 'live') {
    const q = String(body.q || query.q || '').trim().slice(0, 120);
    if (!q) return json(400, { error: 'q required' });
    const r = await liveSearch(store, q);
    const found = queryStories(await store.load(), { view: 'all', q, limit: 60 });
    return json(200, { ...r, ...found });
  }

  if (method === 'GET' && r0 === 'nfl') return json(200, await nflCached());
  if (method === 'GET' && r0 === 'briefing') {
    const all = queryStories(state, { view: 'all', limit: 200 }, now).stories;
    const b = buildBriefing(all, now, { nfl: nflCache?.data || null });
    b.id = `b-${state.meta.lastRefreshAt || now}`;
    return json(200, b);
  }

  if (method === 'GET' && r0 === 'show') {
    const slot = showSlot(now);
    if (!showCache || showCache.slot !== slot) {
      const all = queryStories(state, { view: 'all', limit: 600 }, now).stories;
      showCache = { ...buildShow(all, now, { nfl: nflCache?.data || null, targetMinutes: 2 }), slot }; // phone voice in server mode
    }
    return json(200, showCache);
  }

  if (method === 'GET' && r0 === 'runs') return json(200, { runs: state.runs || [] });

  return json(404, { error: `No route for ${method} /api/${parts.join('/')}` });
}
