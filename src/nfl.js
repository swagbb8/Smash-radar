// NFL: scores (live + final), game leaders (player stats), highlight videos, news.
// Sources: ESPN's public site API (scores/leaders/news) + the official NFL YouTube channel (game & player highlights).
import { fetchText } from './collector.js';
import { parseXmlFeed } from './feeds.js';

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const NFL_YT = 'https://www.youtube.com/feeds/videos.xml?channel_id=UCDVYQ4Zhbm3S2dlz7P1GBDg';

const BROWSER = { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', accept: 'application/json, text/plain, */*', referer: 'https://www.espn.com/', origin: 'https://www.espn.com' };
// ESPN serves the same JSON from two hosts; try the second if the first refuses.
async function getJson(url) {
  let lastErr;
  for (const u of [url, url.replace('site.api.espn.com', 'site.web.api.espn.com')]) {
    try { return JSON.parse((await fetchText(u, { timeout: 10000, headers: BROWSER })).text); } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

function mapGame(ev) {
  const comp = ev.competitions?.[0] || {};
  const side = (ha) => {
    const c = (comp.competitors || []).find((x) => x.homeAway === ha) || {};
    const t = c.team || {};
    return { name: t.name || t.displayName || '', full: t.displayName || '', abbr: t.abbreviation || '', logo: t.logo || null, color: t.color ? `#${t.color}` : null, score: c.score ?? '', record: c.records?.[0]?.summary || '', winner: !!c.winner, linescores: (c.linescores || []).map((l) => l.value) };
  };
  const leaders = [];
  for (const cat of comp.leaders || []) {
    const l = cat.leaders?.[0];
    if (!l?.athlete) continue;
    leaders.push({ category: cat.displayName || cat.name, player: l.athlete.displayName || l.athlete.fullName, value: l.displayValue || String(l.value ?? ''), headshot: l.athlete.headshot?.href || l.athlete.headshot || null, position: l.athlete.position?.abbreviation || '', team: l.team?.abbreviation || l.athlete.team?.abbreviation || '' });
  }
  const st = ev.status?.type || {};
  return {
    id: ev.id, name: ev.name, short: ev.shortName, date: ev.date, week: ev.week?.number ?? null,
    state: st.state || 'pre', completed: !!st.completed, detail: st.shortDetail || st.detail || '',
    venue: comp.venue?.fullName || '', broadcast: comp.broadcasts?.flatMap((b) => b.names || []).join(', ') || '',
    home: side('home'), away: side('away'), leaders,
    link: ev.links?.find((l) => (l.rel || []).includes('summary'))?.href || ev.links?.[0]?.href || `https://www.espn.com/nfl/game/_/gameId/${ev.id}`,
    highlight: null,
  };
}

export async function fetchNfl() {
  const out = { updatedAt: new Date().toISOString(), games: [], news: [], videos: [], errors: [] };
  // Current week + previous week so recent finals stay visible.
  try {
    const cur = await getJson(`${ESPN}/scoreboard`);
    out.season = cur.season?.year;
    out.week = cur.week?.number;
    out.games.push(...(cur.events || []).map(mapGame));
    const seasonType = cur.season?.type ?? 2;
    if (out.week > 1) {
      const prev = await getJson(`${ESPN}/scoreboard?week=${out.week - 1}&seasontype=${seasonType}`).catch(() => null);
      if (prev) out.games.unshift(...(prev.events || []).map(mapGame));
    }
  } catch (e) { out.errors.push(`scoreboard: ${e.message}`); }
  try {
    const news = await getJson(`${ESPN}/news?limit=40`);
    out.news = (news.articles || []).filter((a) => a.headline).map((a) => ({
      title: a.headline, summary: a.description || '', image: a.images?.[0]?.url || null,
      url: a.links?.web?.href || null, published: a.published || a.lastModified || null, type: a.type || 'Story',
    }));
  } catch (e) { out.errors.push(`news: ${e.message}`); }
  try {
    const xml = (await fetchText(NFL_YT, { timeout: 10000 })).text;
    out.videos = parseXmlFeed(xml, { type: 'rss' }).map((v) => {
      const id = (v.link.match(/[?&]v=([\w-]{6,})/) || v.guid?.match(/yt:video:([\w-]+)/) || [])[1] || null;
      return { videoId: id, title: v.title, thumb: v.imageUrl || (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null), published: v.publishedAt, url: v.link };
    }).filter((v) => v.videoId);
  } catch (e) { out.errors.push(`videos: ${e.message}`); }
  // Match "Team vs. Team Game Highlights" videos to games.
  for (const g of out.games) {
    const hit = out.videos.find((v) => /highlight/i.test(v.title) && v.title.includes(g.home.name) && v.title.includes(g.away.name));
    if (hit) g.highlight = hit;
  }
  out.games.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  return out;
}
