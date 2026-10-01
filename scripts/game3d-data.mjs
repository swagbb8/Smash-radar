// Pull everything the 3D replay needs for one game (works for old games too): teams + colors, every scoring play,
// fantasy board totals and real jersey numbers. Usage: node scripts/game3d-data.mjs <gameId> <out.json>
import fs from 'node:fs';
import { fetchGameSummary, fetchLineup } from '../src/nfl.js';
const [id, out] = process.argv.slice(2);
const s = await fetchGameSummary(id);
if (!s.scoring?.length) { console.error(`game ${id}: no scoring plays`); process.exit(1); }
const played = new Set(Object.keys(s.jerseys || {}));
const lineups = {};
for (const k of ['away', 'home']) { try { lineups[s.teams[k].abbr] = await fetchLineup(s.teams[k].id, played); } catch (e) { console.error(`lineup ${s.teams[k].abbr}: ${e.message}`); } }
const pick = (t) => ({ abbr: t.abbr, name: t.name, full: t.full, score: t.score, color: t.color, alt: t.alt });
fs.writeFileSync(out, JSON.stringify({
  game: { away: pick(s.teams.away), home: pick(s.teams.home), week: s.week, fantasy: s.fantasy ? { away: { total: s.fantasy.away?.total ?? 0 }, home: { total: s.fantasy.home?.total ?? 0 } } : null },
  plays: s.scoring, jerseys: s.jerseys, lineups,
}));
console.log(`3d data: ${s.teams.away.abbr} @ ${s.teams.home.abbr}, ${s.scoring.length} scoring plays, ${Object.keys(s.jerseys).length} jerseys`);
