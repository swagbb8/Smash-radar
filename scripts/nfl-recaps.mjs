// Plan NFL recap videos: for every finished game that doesn't have a recap yet, fetch the full game detail
// (scoring plays, leaders, team stats) and write a recap spec + Smash's voice-over script.
// Usage: node scripts/nfl-recaps.mjs <nfl.json> <done.json> <outdir> [max]
import fs from 'node:fs';
import path from 'node:path';
import { fetchGameSummary } from '../src/nfl.js';
import { speakable, speakStat } from '../src/briefing.js';

const [nflPath, donePath, outDir, maxArg] = process.argv.slice(2);
const MAX = Number(maxArg || 4);
const nfl = JSON.parse(fs.readFileSync(nflPath, 'utf8'));
let done = [];
try { done = JSON.parse(fs.readFileSync(donePath, 'utf8')); } catch {}
const doneIds = new Set(done.map((d) => String(d.id)));
fs.mkdirSync(outDir, { recursive: true });
const pending = new Set();
for (const dir of [outDir, path.join(outDir, '..', 'done'), path.join(outDir, '..', 'failed')]) {
  try { for (const f of fs.readdirSync(dir)) if (f.endsWith('.json')) pending.add(f.slice(0, -5)); } catch {}
}

const QN = ['', 'First quarter', 'Second quarter', 'Third quarter', 'Fourth quarter', 'Overtime', 'Double overtime'];
const pick = (arr, seed) => arr[Math.abs([...String(seed)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % arr.length];
const cleanPlay = (t = '') => speakable(String(t)
  .replace(/\s*\((?:[^()]|\([^()]*\))*\)\s*$/, '')            // drop "(Kicker Kick)" / "(two-point ...)"
  .replace(/\bYd\b/gi, 'yard').replace(/\bYds\b/gi, 'yards')
  .replace(/\bFG\b/g, 'field goal').replace(/\bTD\b/g, 'touchdown')
  .replace(/\bpass from\b/i, 'catch from')
  .replace(/\b(\d+) yard (Run|Pass|Field Goal|Interception Return|Fumble Return|Punt Return|Kickoff Return|Catch)\b/gi, (m, n, k) => `${n} yard ${k.toLowerCase()}`));

function leadLine(p, away, home) {
  const a = Number(p.away), h = Number(p.home);
  if (Number.isNaN(a) || Number.isNaN(h)) return '';
  if (a === h) return `All tied up at ${a}.`;
  const [lt, hi, lo] = a > h ? [away, a, h] : [home, h, a];
  return `${lt.name} ${pick(['lead', 'go up', 'now lead'], p.text)} ${hi} to ${lo}.`;
}

function selectPlays(plays) {
  if (plays.length <= 8) return plays;
  const td = plays.filter((p) => /touchdown/i.test(p.type) || p.abbr === 'TD');
  const keep = new Set((td.length > 8 ? td.slice(-8) : td));
  for (const p of plays.slice().reverse()) { if (keep.size >= 8) break; keep.add(p); }
  return plays.filter((p) => keep.has(p));
}

const finals = (nfl.games || []).filter((g) => g.state === 'post' && Date.now() - Date.parse(g.date) < 10 * 864e5 && !doneIds.has(String(g.id)) && !pending.has(String(g.id)));
let made = 0;
for (const g of finals.sort((a, b) => Date.parse(b.date) - Date.parse(a.date))) {
  if (made >= MAX) break;
  let sum = null;
  try { sum = await fetchGameSummary(g.id); } catch (e) { console.error(`recap ${g.id}: summary failed (${e.message}), using scoreboard only`); }
  const side = (k) => ({ ...g[k], ...(sum?.teams?.[k] || {}), color: sum?.teams?.[k]?.color || g[k].color || '#333333', alt: sum?.teams?.[k]?.alt || null, logo: sum?.teams?.[k]?.logo || g[k].logo });
  const away = side('away'); const home = side('home');
  const [W, L] = Number(away.score) > Number(home.score) ? [away, home] : [home, away];
  const margin = Number(W.score) - Number(L.score);
  const plays = selectPlays(sum?.scoring || []);
  const leaders = [];
  const lead = (re) => (sum?.leaders || []).filter((l) => re.test(l.key || l.category)).sort((a, b) => parseInt(String(b.value).match(/(\d+)\s*YDS/i)?.[1] || 0, 10) - parseInt(String(a.value).match(/(\d+)\s*YDS/i)?.[1] || 0, 10))[0];
  for (const [re, label, intro] of [[/passing/i, 'PASSING', 'Player of the game'], [/rushing/i, 'RUSHING', 'On the ground'], [/receiving/i, 'RECEIVING', 'Top target']]) {
    const l = lead(re);
    if (l) leaders.push({ ...l, label, intro });
  }
  if (!leaders.length) for (const l of (g.leaders || []).slice(0, 3)) leaders.push({ player: l.player, value: l.value, team: l.team, position: l.position, label: (l.category || '').replace(/ Leader$/i, '').toUpperCase(), intro: 'Leader' });
  const stat = (abbr, k) => sum?.teamStats?.find((t) => t.abbr === abbr)?.stats?.[k] || null;
  const voice = [];
  const flavor = margin <= 3 ? pick(['That one went down to the wire! Holy crap.', 'Nail biter! My heart cannot take this.'], g.id) : margin >= 21 ? pick(['That was a straight up beatdown. Damn.', 'Somebody check on the other sideline, because that was rough.'], g.id) : pick(['What a game!', "Let's break it down!"], g.id);
  voice.push({ scene: 'intro', text: `Final score! The ${W.full || W.name} beat the ${L.full || L.name}, ${W.score} to ${L.score}${(sum?.venue || g.venue) ? `, at ${sum?.venue || g.venue}` : ''}. ${flavor}` });
  if ((away.linescores || []).length) voice.push({ scene: 'box', text: 'Here is how it went down, quarter by quarter.' });
  plays.forEach((p, i) => voice.push({ scene: `play${i}`, text: `${QN[p.period] || 'Then'}${p.clock ? `, ${p.clock.replace(/^0/, '')} left` : ''}. ${cleanPlay(p.text)}. ${leadLine(p, away, home)}`.replace(/\.\./g, '.') }));
  leaders.forEach((l, i) => voice.push({ scene: `leader${i}`, text: `${l.intro}: ${l.player}, ${speakStat(l.value)}.` }));
  voice.push({ scene: 'outro', text: pick(["That's your recap. Smash out!", 'And that is the ballgame. Smash out!', "That's the recap, baby. Smash out!"], g.id) });
  const spec = {
    id: String(g.id), title: `${W.name} ${W.score}, ${L.name} ${L.score}`, week: sum?.week ?? g.week, date: g.date, venue: sum?.venue || g.venue,
    away, home, winner: W === away ? 'away' : 'home', plays, leaders,
    stats: { away: { yards: stat(away.abbr, 'totalYards'), turnovers: stat(away.abbr, 'turnovers') }, home: { yards: stat(home.abbr, 'totalYards'), turnovers: stat(home.abbr, 'turnovers') } },
    voice,
  };
  fs.writeFileSync(path.join(outDir, `${g.id}.json`), JSON.stringify(spec, null, 1));
  console.log(`recap planned: ${spec.title} (${plays.length} scoring plays, ${leaders.length} leaders)`);
  made++;
}
if (!made) console.log('recaps: nothing new to make');
