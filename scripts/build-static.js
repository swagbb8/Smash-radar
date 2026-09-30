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
write('dupage', await call('/api/dupage'));
write('brands', await call('/api/brands'));
write('sources', await call('/api/sources'));
console.log(`published ${stories.length} stories → ${path.relative(ROOT, OUT)}/`);
