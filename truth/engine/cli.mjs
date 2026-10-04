#!/usr/bin/env node
// THE TRUTH engine — command line.
//   node engine/cli.mjs run     --store DIR [--count 4] [--minutes 300] [--subject brain] [--images]
//   node engine/cli.mjs build   --store DIR --out DIR          (studio + site + data → a deployable folder)
//   node engine/cli.mjs request --store DIR --topic "…" [--by name]
//   node engine/cli.mjs status  --store DIR
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './store.mjs';
import { nextTopics, markTopic, runway, brainstorm, coverage } from './discover.mjs';
import { makePost, ENGINE_VERSION } from './pipeline.mjs';
import { active, providers } from './llm/index.mjs';
import { stats as httpStats } from './lib/http.mjs';
import { slug } from './lib/text.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2); const cmd = args[0];
const opt = (name, d) => { const i = args.indexOf('--' + name); if (i < 0) return d; const v = args[i + 1]; return v === undefined || v.startsWith('--') ? true : v; };
const log = (...a) => console.log(`[truth ${new Date().toISOString().slice(11, 19)}]`, ...a);

async function run() {
  const store = new Store(opt('store', 'store')); const count = Number(opt('count', 4)); const minutes = Number(opt('minutes', 300)); const withImages = !!opt('images', false);
  const t0 = Date.now(); const deadline = t0 + minutes * 60e3; const llm = active();
  if (!llm) { log('no AI writer is available — nothing to do'); process.exitCode = 2; return; }
  log(`engine ${ENGINE_VERSION} · writer ${llm.name}:${llm.model} · target ${count} post(s) in ${minutes} min · ${store.index.posts.length} in the library · ${runway(store)} topics waiting`);
  const queue = nextTopics(store, count * 3, { subject: opt('subject', '') }); const made = [], failed = []; let longest = 0;
  for (const t of queue) {
    if (made.length >= count) break;
    const left = deadline - Date.now(); if (left < Math.max(8 * 60e3, longest * 1.25)) { log('time budget reached'); break; }
    const p0 = Date.now(); let r;
    try { r = await makePost({ ...t, avoid: store.headlines() }); } catch (e) { r = { ok: false, reason: 'crash: ' + (e.message || e) }; }
    longest = Math.max(longest, Date.now() - p0);
    if (!r.ok) {
      const offline = (r.trace?.research?.search?.errors || []).length > 0 && !(r.trace?.research?.sources || []).length;      // the search services were down: try this topic again another day
      failed.push({ topic: t.topic, reason: offline ? 'search services unavailable' : r.reason }); if (!offline) markTopic(store, t, 'failed', { reason: String(r.reason).slice(0, 300) }); saveTrace(store, t, r); store.save(); continue;
    }
    let post = r.post; post.origin = t.origin || 'seed'; post.topicKey = t.key;
    if (withImages && post.imageIdeas?.length) {
      try { const { fetchImages } = await import('./images.mjs'); const dir = path.join(store.data, 'img', post.id); post.images = (await fetchImages(post.imageIdeas.slice(0, 3), dir, { prefix: 'p' })).map((im) => (im?.file ? { ...im, file: `data/img/${post.id}/${im.file}` } : null)); } catch (e) { log('  pictures skipped:', e.message); }
    }
    post = store.addPost(post);
    try { const { renderThumb } = await import('./render-node.mjs'); await renderThumb(post, path.join(store.data, 'thumb', post.id + '.jpg'), { imageDir: store.dir }); } catch (e) { log('  thumbnail failed:', e.message); }
    markTopic(store, t, 'done', { post: post.id }); saveTrace(store, t, r, post.id); made.push(post.id); store.save();
  }
  // keep the runway long: when few topics are left, ask the writer for fresh questions in the thinnest subject
  if (runway(store) < 24 && deadline - Date.now() > 6 * 60e3) { const cov = coverage(store); const thin = Object.keys(cov).sort((a, b) => cov[a] - cov[b])[0]; const b = await brainstorm(store, thin); log(`brainstorm (${thin}): ${b.ok ? b.added + ' new idea(s)' : b.error}`); }
  const runRec = { at: new Date(t0).toISOString(), seconds: Math.round((Date.now() - t0) / 1000), made: made.length, failed: failed.length, posts: made, failures: failed.slice(0, 8), writer: `${llm.name}:${llm.model}`, version: ENGINE_VERSION, http: { requests: httpStats.requests, failures: httpStats.failures } };
  store.engine.runs = [runRec, ...(store.engine.runs || [])].slice(0, 40); store.engine.totals = { made: (store.engine.totals?.made || 0) + made.length, failed: (store.engine.totals?.failed || 0) + failed.length };
  store.engine.writer = { provider: llm.name, model: llm.model, free: !!llm.free }; store.engine.runway = runway(store); store.engine.coverage = coverage(store);
  store.engine.providers = Object.fromEntries(Object.entries(providers()).filter(([k]) => k !== 'mock').map(([k, v]) => [k, { ready: v.ready, model: v.model, free: v.free }]));
  store.save(); log(`done: ${made.length} made, ${failed.length} failed, ${runRec.seconds}s`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### THE TRUTH engine\n- made: ${made.length}\n- failed: ${failed.length}\n${failed.map((f) => `  - ${f.topic}: ${f.reason}`).join('\n')}\n`);
}

/** Keep the research trail for each attempt (what was searched, which claims were rejected and why). */
function saveTrace(store, t, r, postId = null) {
  const id = postId || `failed-${new Date().toISOString().slice(0, 10)}-${slug(t.topic, 40)}`; const f = path.join(store.data, 'trace', id + '.json');
  fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify({ id, ok: !!r.ok, reason: r.reason || '', topic: t.topic, subject: t.subject, at: new Date().toISOString(), ...r.trace }));
}

function copyDir(from, to, skip = () => false) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) { const a = path.join(from, e.name), b = path.join(to, e.name); if (skip(a)) continue; if (e.isDirectory()) copyDir(a, b, skip); else fs.copyFileSync(a, b); }
}

async function build() {
  const store = new Store(opt('store', 'store')); const out = opt('out', 'dist');
  copyDir(path.join(ROOT, 'app'), out); if (fs.existsSync(store.data)) copyDir(store.data, path.join(out, 'data'));
  fs.writeFileSync(path.join(out, '.nojekyll'), '');
  const version = { built: new Date().toISOString(), engine: ENGINE_VERSION, posts: store.index.posts.length, commit: process.env.GITHUB_SHA || '' }; fs.writeFileSync(path.join(out, 'version.json'), JSON.stringify(version));
  try { const { buildSite } = await import('./site.mjs'); await buildSite(store, out); } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; }
  log(`built ${out}: ${store.index.posts.length} post(s)`);
}

function request() {
  const store = new Store(opt('store', 'store')); const topic = String(opt('topic', process.env.TRUTH_TOPIC || '')).replace(/\s+/g, ' ').trim().slice(0, 200); if (topic.length < 8) { log('topic too short'); process.exitCode = 1; return; }
  const key = 'req:' + Date.now().toString(36); const words = topic.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3).slice(0, 6).join(' ');
  store.topics.requests.push({ key, origin: 'request', status: 'waiting', subject: opt('subject', 'psychology'), style: opt('style', 'uncomfortable'), topic, angle: opt('angle', topic), queries: [opt('query', words), words].filter((v, i, a) => v && a.indexOf(v) === i), by: opt('by', ''), created: new Date().toISOString() });
  store.save(); log('request queued:', topic);
}

function status() { const s = new Store(opt('store', 'store')); console.log(JSON.stringify({ posts: s.index.posts.length, runway: runway(s), coverage: coverage(s), last: s.engine.runs?.[0] || null }, null, 1)); }

await ({ run, build, request, status }[cmd] || (() => { console.log('usage: cli.mjs run|build|request|status --store DIR …'); process.exitCode = 1; }))();
