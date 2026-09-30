// One-shot refresh from the command line (use with cron/Task Scheduler if you don't keep the server running).
//   node scripts/refresh-once.js           → refresh sources that are due
//   node scripts/refresh-once.js --force   → refresh every source now
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
} catch {}
const { FileStore } = await import('../src/store.js');
const { refresh } = await import('../src/collector.js');
const store = new FileStore(path.resolve(ROOT, process.env.DATABASE_PATH || 'data/smash-radar.json'));
const force = process.argv.includes('--force');
const run = await refresh(store, {
  force, trigger: 'cli',
  onEvent: (e) => { if (e.type === 'source' && !e.ok) console.log(`  ✗ ${e.id}: ${e.error}`); },
});
console.log(`checked ${run.sourcesChecked} sources · ok ${run.ok} · failed ${run.failed} · new ${run.added} · changed ${run.changed} · merged dupes ${run.duplicates} · rejected (not DuPage) ${run.rejected} · images/summaries enriched ${run.enriched} · ${run.durationMs}ms`);
