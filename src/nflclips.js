// Find official, embeddable highlight clips for an NFL game (NFL, the 32 teams, and the TV networks that carry the games).
// Clips are only linked/embedded (played by YouTube's own player) — never downloaded or re-cut.
import { fetchText } from './collector.js';

const OFFICIAL = [/^nfl$/i, /^nfl throwback$/i, /^espn$/i, /^nfl on espn$/i, /^nfl on fox$/i, /^fox sports$/i, /^nfl on cbs/i, /^cbs sports$/i, /^nbc sports$/i, /^sunday night football/i, /^prime video sport/i, /^amazon prime video sport/i, /^nfl network$/i, /^good morning football$/i];
const BROWSER = { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36', 'accept-language': 'en-US,en;q=0.9', accept: 'text/html' };

function* walk(o) {
  if (!o || typeof o !== 'object') return;
  if (o.videoRenderer) yield o.videoRenderer;
  for (const v of Object.values(o)) yield* walk(v);
}
const text = (x) => x?.simpleText || (x?.runs || []).map((r) => r.text).join('') || '';
const secs = (s = '') => s.split(':').reduce((a, b) => a * 60 + Number(b), 0);

async function search(q, recent = true) {
  const html = (await fetchText(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}${recent ? '&sp=EgIIBA%3D%3D' : ''}`, { timeout: 12000, maxBytes: 4_000_000, headers: BROWSER })).text; // sp = uploaded this week
  const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s) || html.match(/ytInitialData"\]\s*=\s*(\{.*?\});/s);
  if (!m) return [];
  let data; try { data = JSON.parse(m[1]); } catch { return []; }
  const out = [];
  for (const v of walk(data)) {
    out.push({ videoId: v.videoId, title: text(v.title), channel: text(v.ownerText) || text(v.longBylineText), length: text(v.lengthText), seconds: secs(text(v.lengthText)), published: text(v.publishedTimeText), thumb: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg` });
  }
  return out;
}

export async function findGameClips(g) {
  const A = g.away, H = g.home;
  const teamChannels = [A.full, H.full].filter(Boolean).map((n) => new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'));
  const okChannel = (c) => OFFICIAL.some((r) => r.test(c)) || teamChannels.some((r) => r.test(c));
  const mentions = (t) => [A.name, H.name, A.full, H.full].filter(Boolean).some((n) => t.toLowerCase().includes(n.toLowerCase()));
  const queries = [`${A.full} vs ${H.full} highlights`, `${A.name} vs ${H.name} touchdown`, `${H.name} ${A.name} best plays`];
  const seen = new Map();
  for (const q of queries) {
    let res = [];
    try { res = await search(q); } catch { continue; }
    for (const v of res) {
      if (!v.videoId || seen.has(v.videoId)) continue;
      if (!okChannel(v.channel) || !mentions(v.title)) continue;
      if (v.seconds && v.seconds > 25 * 60) continue; // no full-length uploads
      seen.set(v.videoId, v);
    }
  }
  if (seen.size < 2) { // nothing this week? search without the date filter
    for (const q of [`${A.full} vs ${H.full} highlights ${new Date(g.date || Date.now()).getFullYear()}`, `${H.full} vs ${A.full} game highlights`]) {
      let res = []; try { res = await search(q, false); } catch { continue; }
      for (const v of res) if (v.videoId && !seen.has(v.videoId) && okChannel(v.channel) && mentions(v.title) && !(v.seconds > 25 * 60) && !/\b(19|20)\d\d\b/.test(v.title.replace(String(new Date(g.date || Date.now()).getFullYear()), ''))) seen.set(v.videoId, v);
    }
  }
  const all = [...seen.values()];
  const main = all.filter((v) => /game highlights|full highlights|highlights \|/i.test(v.title) && v.seconds >= 300).sort((a, b) => b.seconds - a.seconds)[0] || null;
  const clips = all.filter((v) => v !== main).sort((a, b) => (a.seconds || 999) - (b.seconds || 999)).slice(0, 14);
  return { main, clips };
}

/** Attach cached clips to finished games; refresh a few games per run (each at most every 3 hours, for 4 days). */
export async function addClips(nfl, cache, { perRun = 6 } = {}) {
  let n = 0;
  const finals = (nfl.games || []).filter((g) => g.state === 'post' && Date.now() - Date.parse(g.date) < 4 * 864e5).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  for (const g of finals) {
    const c = cache[g.id];
    if (n < perRun && (!c || Date.now() - c.at > ((c.clips?.length || c.main) ? 3 : 0.75) * 3600e3)) {
      try { const r = await findGameClips(g); cache[g.id] = { at: Date.now(), ...r }; n++; } catch { /* keep old */ }
    }
  }
  for (const g of nfl.games || []) {
    const c = cache[g.id];
    if (!c) continue;
    g.clips = c.clips || [];
    if (c.main) g.mainHighlight = c.main;
    if (!g.highlight && c.main) g.highlight = { ...c.main, url: `https://www.youtube.com/watch?v=${c.main.videoId}` };
  }
  for (const id of Object.keys(cache)) if (Date.now() - cache[id].at > 10 * 864e5) delete cache[id];
  return n;
}
