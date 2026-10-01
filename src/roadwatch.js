// Road Watch: road closures, crashes, construction and police activity grouped by state, for the
// map video that's re-made every 10 minutes. Only facts from the stories are used (no made-up times).
const ROAD_INC = new Set(['crash', 'closure', 'construction', 'traffic', 'police', 'fire', 'flooding', 'weather', 'outage', 'metra', 'trees', 'emergency']);
const ROADY = /\b(crash(es|ed)?|collision|wreck|pile-?up|rollover|closure|closed|close[sd]?|lanes?|construction|road ?work|detour|I-\d+|interstate|highway|expressway|tollway|turnpike|ramp|bridge|traffic|jackknif\w*|overturned|semi|pedestrian struck|hit-and-run|fatal|sinkhole|water main)\b/i;
const NOT_ROAD = /\b(permanently|store|restaurant|shop|business|how to|tips|what to do|stormwater|detention|riverfront|project enters|lawsuit|sentenced|trial|court|school board|election|cocaine|drugs seized)\b/i;
const ROAD_WORDS = /\b(I-\d+|interstate|highway|hwy|route|rt\.|road|rd\.|street|st\.|avenue|ave|lanes?|tollway|turnpike|expressway|parkway|bridge|ramp|intersection|traffic|pursuit|chase|crash)\b/i;
const pub = (s) => Date.parse(s.publishedAt || s.discoveredAt);

export function incidentType(t) {
  if (/crash|collision|wreck|pile-?up|rollover|struck|hit-and-run|jackknif|overturned|slams? into|head-on/i.test(t)) return ['crash', '💥', 'CRASH'];
  if (/clos(ed|ure|ing)|shut ?down|blocked|detour/i.test(t)) return ['closure', '⛔', 'CLOSURE'];
  if (/construction|road ?work|repav|resurfac|lane reduction|work zone/i.test(t)) return ['construction', '🚧', 'CONSTRUCTION'];
  if (/police|shoot|swat|chase|arrest|standoff/i.test(t)) return ['police', '🚓', 'POLICE'];
  if (/fire|smoke/i.test(t)) return ['fire', '🔥', 'FIRE'];
  if (/flood|snow|ice|storm|tornado|weather/i.test(t)) return ['weather', '⛈️', 'WEATHER'];
  return ['traffic', '🚦', 'TRAFFIC'];
}

/** Only quote an estimate the source actually gave. */
export function estimate(text) {
  const t = String(text).replace(/\s+/g, ' ');
  let m = t.match(/\b(?:expected to (?:re)?open|will (?:re)?open|reopen(?:s|ing)?|closed|shut down|remain closed)\s+(until|through|by|for|around|at)\s+([^.;,()]{3,40})/i);
  if (m) return `${m[1].toLowerCase()} ${m[2].trim()}`;
  m = t.match(/\b(?:for|about|up to|several)\s+(\d+(?:-\d+)?\s*(?:hours?|hrs?|days?|weeks?|months?))/i);
  if (m && /clos|block|detour|shut/i.test(t)) return `about ${m[1]}`;
  if (/\breopened\b|\ball lanes (?:are )?(?:now )?open\b|\bcleared\b/i.test(t)) return 'reopened / cleared';
  return null;
}

export function buildRoadWatch(stories, now = Date.now(), { maxStates = 7, perState = 4, hours = 12 } = {}) {
  const items = [];
  const seen = new Set();
  for (const s of stories) {
    if (now - pub(s) > hours * 3600e3) continue;
    const text = `${s.title} ${s.summary || ''}`;
    const inc = s.location?.incident?.id;
    const roadish = s.region?.roads || ROAD_INC.has(inc) || ROADY.test(s.title);
    if (!roadish || !ROADY.test(text) && !ROAD_INC.has(inc)) continue;
    if (NOT_ROAD.test(s.title) || !ROAD_WORDS.test(s.title)) continue;
    const local = s.location && ['confirmed', 'verified', 'nearby'].includes(s.location.status);
    const state = s.region?.state || ((local || s.region?.county) ? 'Illinois' : null);
    if (!state) continue;
    const toks = new Set(s.title.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
    if ([...seen].some((o) => { let n = 0; for (const w of toks) if (o.has(w)) n++; return n / Math.max(1, Math.min(toks.size, o.size)) > 0.5; })) continue;
    seen.add(toks);
    const [type, icon, label] = incidentType(text);
    const county = s.region?.county || (local ? 'DuPage' : null);
    const place = (s.location?.places || []).find((p) => p !== 'DuPage County') || (county ? `${county} County` : null);
    items.push({ id: s.id, state, county, place, type, icon, label, title: s.title.replace(/\s+[-|–—]\s+[^-|–—]{2,40}$/, ''), source: s.sourceName, at: s.publishedAt || s.discoveredAt, est: estimate(text), roads: s.location?.roads || [], score: s.score || 0 });
  }
  const byState = new Map();
  for (const it of items) { if (!byState.has(it.state)) byState.set(it.state, []); byState.get(it.state).push(it); }
  const order = { crash: 0, closure: 1, construction: 2, police: 3, fire: 4, weather: 5, traffic: 6 };
  const states = [...byState.entries()].map(([name, list]) => ({
    name, count: list.length,
    incidents: list.sort((a, b) => (order[a.type] - order[b.type]) || (Date.parse(b.at) - Date.parse(a.at))).slice(0, perState),
  })).sort((a, b) => (a.name === 'Illinois' ? -1 : b.name === 'Illinois' ? 1 : b.count - a.count)).slice(0, maxStates);
  return { createdAt: new Date(now).toISOString(), total: items.length, stateCount: byState.size, states };
}
