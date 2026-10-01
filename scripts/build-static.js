// Sweep sources, then publish the app + a JSON snapshot of the radar as a static site (dist/).
// Used by the GitHub Actions workflow (free hosting on GitHub Pages). Run locally: node scripts/build-static.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { FileStore } = await import('../src/store.js');
const { refresh } = await import('../src/collector.js');
const { handleApi } = await import('../src/api.js');
const { present } = await import('../src/engine.js');
const { buildBriefing, buildShow, showSlot } = await import('../src/briefing.js');

const OUT = path.resolve(ROOT, process.env.STATIC_OUT || 'dist');
const store = new FileStore(path.resolve(ROOT, process.env.DATABASE_PATH || 'data/smash-radar.json'));

if (!process.argv.includes('--no-refresh')) {
  const run = await refresh(store, {
    force: process.argv.includes('--force'),
    trigger: 'github-actions',
    deadlineMs: Number(process.env.SWEEP_BUDGET_MS || 240000),
    onEvent: (e) => { if (e.type === 'source' && !e.ok) console.log(`  ✗ ${e.id}: ${e.error}`); },
  });
  console.log(`sweep: checked ${run.sourcesChecked} · ok ${run.ok} · failed ${run.failed} · new ${run.added} · changed ${run.changed} · dupes ${run.duplicates} · rejected ${run.rejected} · enriched ${run.enriched} · ${run.durationMs}ms`);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'public'), OUT, { recursive: true });
fs.mkdirSync(path.join(OUT, 'api'), { recursive: true });
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

const call = async (p, query = {}) => (await handleApi({ method: 'GET', path: p, query }, { store, mode: 'static' })).body;
const write = (name, data) => fs.writeFileSync(path.join(OUT, 'api', `${name}.json`), JSON.stringify(data));

const state = await store.load();
const now = Date.now();
const stories = Object.values(state.stories)
  .map((s) => present(s, now))
  .filter((s) => s.status !== 'ENDED' && now - Date.parse(s.publishedAt || s.discoveredAt) < 8 * 864e5)
  .sort((a, b) => b.score - a.score)
  .slice(0, Number(process.env.STATIC_MAX_STORIES || 1500));

const apLog = (() => { try { return JSON.parse(fs.readFileSync(path.join(path.dirname(store.file), 'autopost-log.json'), 'utf8')); } catch { return null; } })();
const autopost = apLog ? { last: apLog.posts.at(-1) || null, today: apLog.posts.filter((p) => p.day === new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())).length, lastError: apLog.errors?.[0] || null } : null;
write('meta', { ...(await call('/api/meta')), mode: 'static', refreshing: false, nextRefreshAt: null, autopost });
write('stories', { total: stories.length, stories });
let nfl = null;
if (process.env.NFL !== 'off') {
  try { const { fetchNfl } = await import('../src/nfl.js'); nfl = await fetchNfl(); write('nfl', nfl); console.log(`nfl: ${nfl.games.length} games, ${nfl.videos.length} videos, ${nfl.news.length} news${nfl.errors.length ? ` (errors: ${nfl.errors.join('; ')})` : ''}`); }
  catch (e) { console.log('nfl failed:', e.message); }
}
if (nfl && process.env.NFL_CLIPS !== 'off') { // official highlight clips for Highlight Mode
  try {
    const { addClips } = await import('../src/nflclips.js');
    const cf = path.join(path.dirname(store.file), 'nfl-clips.json');
    let cache = {}; try { cache = JSON.parse(fs.readFileSync(cf, 'utf8')); } catch {}
    const n = await addClips(nfl, cache);
    fs.writeFileSync(cf, JSON.stringify(cache)); write('nfl', nfl);
    console.log(`nfl clips: searched ${n} games, ${nfl.games.filter((g) => g.clips?.length).length} games have clips`);
  } catch (e) { console.log('nfl clips failed:', e.message); }
}
if (!nfl) { try { nfl = JSON.parse(fs.readFileSync(path.join(OUT, 'api', 'nfl.json'), 'utf8')); } catch { nfl = { games: [], news: [], videos: [], errors: ['not loaded'] }; write('nfl', nfl); } }
if (process.env.LION === 'on') { // the talking-lion show is retired (off unless LION=on)
write('briefing', buildBriefing(stories, Date.now(), { nfl }));
  // Live TV show: a brand-new 2-minute "big stuff" rundown every 10 minutes (Central time). tts.py voices it and sets the real timing.
  {
    const showFile = path.join(path.dirname(store.file), 'show.json');
    let show = null;
    try { show = JSON.parse(fs.readFileSync(showFile, 'utf8')); } catch {}
    const slot = showSlot(now, Number(process.env.SHOW_EVERY_MINUTES || 10));
    if (!show || show.slot !== slot || process.env.SHOW_REBUILD === '1') {
      const avoid = (show?.segments || []).map((g) => g.storyId).filter(Boolean); // don't repeat the last rundown
      show = { ...buildShow(stories, now, { nfl, avoid, targetMinutes: Number(process.env.SHOW_MINUTES || 2) }), slot, startsAt: null };
      fs.writeFileSync(showFile, JSON.stringify(show));
      console.log(`show: new ${slot} show, ${show.segments.length} segments, ~${Math.round(show.totalSeconds / 60)} min`);
    } else console.log(`show: keeping ${slot} show (${show.segments.length} segments)`);
    write('show', show);
  }
}
// NFL recap videos: a background worker makes one for every finished game (see scripts/recaps.py)
await nflRecaps(nfl);
write('dupage', await call('/api/dupage'));
write('brands', await call('/api/brands'));
write('sources', await call('/api/sources'));
console.log(`published ${stories.length} stories → ${path.relative(ROOT, OUT)}/`);

async function nflRecaps(nflData) {
  if (process.env.RECAPS === 'off') return;
  const { execSync, spawn } = await import('node:child_process');
  const WORK = process.env.RECAP_DIR || '/tmp/smash-recaps';
  const dataDir = path.dirname(store.file);
  const doneFile = path.join(dataDir, 'nfl-recaps.json');
  const PAGES_KEEP = Number(process.env.RECAPS_ON_SITE || 24);
  fs.mkdirSync(path.join(WORK, 'out'), { recursive: true });
  let recs = [];
  try { recs = JSON.parse(fs.readFileSync(doneFile, 'utf8')); } catch {}
  // merge finished recaps from the worker
  const newFile = path.join(WORK, 'new.jsonl');
  if (fs.existsSync(newFile)) {
    fs.renameSync(newFile, `${newFile}.reading`);
    for (const line of fs.readFileSync(`${newFile}.reading`, 'utf8').split('\n')) {
      try { const r = JSON.parse(line); recs = recs.filter((x) => x.id !== r.id); recs.push(r); } catch {}
    }
    fs.rmSync(`${newFile}.reading`, { force: true });
    recs.sort((x, y) => Date.parse(y.date || 0) - Date.parse(x.date || 0));
    fs.writeFileSync(doneFile, JSON.stringify(recs));
  }
  // after a restart, bring back the recap videos already on the site
  const pagesDir = path.join(WORK, 'pages');
  if (!fs.existsSync(pagesDir)) {
    fs.mkdirSync(pagesDir, { recursive: true });
    try { execSync(`git fetch -q --depth 1 origin gh-pages && git archive FETCH_HEAD nfl | tar -x -C ${JSON.stringify(pagesDir)} --strip-components=1`, { cwd: ROOT, stdio: 'ignore', timeout: 120000 }); } catch {}
  }
  for (const f of fs.readdirSync(path.join(WORK, 'out'))) if (f.endsWith('.mp4') && !fs.existsSync(path.join(pagesDir, f))) fs.copyFileSync(path.join(WORK, 'out', f), path.join(pagesDir, f));
  fs.mkdirSync(path.join(OUT, 'nfl'), { recursive: true });
  const onSite = new Set(recs.slice(0, PAGES_KEEP).map((r) => r.file));
  for (const r of recs) {
    if (onSite.has(r.file) && fs.existsSync(path.join(pagesDir, r.file))) { fs.copyFileSync(path.join(pagesDir, r.file), path.join(OUT, 'nfl', r.file)); r.page = `nfl/${r.file}`; }
    else delete r.page;
  }
  write('recaps', { recaps: recs });
  console.log(`recaps: ${recs.length} made, ${recs.filter((r) => r.page).length} on the site`);
  // start the worker if it isn't already running
  const lock = path.join(WORK, 'running.lock');
  if (fs.existsSync(lock) && Date.now() - fs.statSync(lock).mtimeMs < 50 * 60e3) return;
  if (!(nflData?.games || []).some((g) => g.state === 'post')) return;
  fs.writeFileSync(path.join(WORK, 'nfl.json'), JSON.stringify(nflData));
  fs.writeFileSync(lock, String(Date.now()));
  const cmd = `(command -v ffmpeg >/dev/null || sudo apt-get install -y -qq ffmpeg >/dev/null 2>&1); (python3 -c 'import playwright, numpy, edge_tts' 2>/dev/null || pip install -q playwright numpy edge-tts >/dev/null 2>&1); python3 scripts/recaps.py ${JSON.stringify(path.join(WORK, 'nfl.json'))} ${JSON.stringify(doneFile)}`;
  const child = spawn('bash', ['-c', cmd], { cwd: ROOT, detached: true, stdio: ['ignore', fs.openSync(path.join(WORK, 'worker.log'), 'a'), fs.openSync(path.join(WORK, 'worker.log'), 'a')] });
  child.unref();
  console.log('recaps: worker started');
}
