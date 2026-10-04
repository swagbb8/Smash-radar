#!/usr/bin/env node
// THE TRUTH engine — command line.
//   node engine/cli.mjs plan    --store DIR [--issues issues.json]     (read requests, decide what this run does)
//   node engine/cli.mjs run     --store DIR [--count 4] [--minutes 300] [--subject brain]
//   node engine/cli.mjs build   --store DIR --out DIR                  (studio + site + data → a deployable folder)
//   node engine/cli.mjs request --store DIR --topic "…"
//   node engine/cli.mjs status  --store DIR
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './store.mjs';
import { nextTopics, markTopic, runway, brainstorm, coverage } from './discover.mjs';
import { SUBJECTS } from './seeds.mjs';
import { makePost, alternates, ENGINE_VERSION } from './pipeline.mjs';
import { STYLES } from './prompts.mjs';
import { active, providers } from './llm/index.mjs';
import { stats as httpStats } from './lib/http.mjs';
import { slug } from './lib/text.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2); const cmd = args[0];
const opt = (name, d) => { const i = args.indexOf('--' + name); if (i < 0) return d; const v = args[i + 1]; return v === undefined || v.startsWith('--') ? true : v; };
const log = (...a) => console.log(`[truth ${new Date().toISOString().slice(11, 19)}]`, ...a);
const RUNS_PER_DAY = 4;                                   // must match the schedule in .github/workflows/truth.yml
const SLIDES = ['reveal', 'explain', 'matters', 'example', 'question'];

// ------------------------------------------------------------------------------------------------ requests
function addRequest(store, topic, { subject = 'psychology', style = 'uncomfortable', by = '' } = {}) {
  topic = String(topic).replace(/\s+/g, ' ').trim().slice(0, 200); if (topic.length < 8) return null;
  if (store.topics.requests.some((r) => r.status === 'waiting' && r.topic.toLowerCase() === topic.toLowerCase())) return topic;
  const words = topic.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !['does', 'what', 'when', 'your', 'that', 'with', 'really', 'actually', 'have', 'this', 'make', 'makes'].includes(w));
  store.topics.requests.push({ key: 'req:' + Date.now().toString(36) + store.topics.requests.length, origin: 'request', status: 'waiting', subject: SUBJECTS[subject] ? subject : 'psychology', style: STYLES[style] ? style : 'uncomfortable', topic, angle: topic, queries: [words.slice(0, 5).join(' '), words.slice(0, 3).join(' ')].filter((v, i, a) => v && a.indexOf(v) === i), by, created: new Date().toISOString() });
  return topic;
}

const URL_OK = /^https:\/\/[^\s<>"'`\\]{4,200}$/;
/** Ash's public settings, checked field by field. Anything that does not look right is ignored, never stored. */
export function cleanConfig(input, prev = {}) {
  const out = { ...prev }; const notes = []; const i = input && typeof input === 'object' ? input : {};
  const set = (key, v, ok, label) => { if (v === undefined) return; if (v === '' || v === null) { delete out[key]; return; } if (ok(v)) out[key] = v; else notes.push(`${label} was not saved (it does not look right)`); };
  set('handle', typeof i.handle === 'string' ? i.handle.replace(/^@/, '').trim() : undefined, (v) => /^[a-z0-9._]{1,30}$/i.test(v), 'Instagram name');
  set('domain', typeof i.domain === 'string' ? i.domain.trim().toLowerCase() : undefined, (v) => /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(v) && v.length < 80, 'Web address');
  if (i.intensity !== undefined) { if ([1, 2, 3].includes(Number(i.intensity))) out.intensity = Number(i.intensity); else notes.push('Tone was not saved'); }
  if (i.daily !== undefined) { const d = Math.round(Number(i.daily)); if (d >= 2 && d <= 16) out.daily = d; else notes.push('Files a day was not saved'); }
  if (i.money && typeof i.money === 'object') {
    const m = {}; const rules = { tips: (v) => URL_OK.test(v), product: (v) => URL_OK.test(v), newsletter: (v) => URL_OK.test(v), amazon: (v) => /^[a-z0-9][a-z0-9-]{1,30}-2\d$/i.test(v), adsense: (v) => /^ca-pub-\d{10,20}$/.test(v) };
    for (const [k, ok] of Object.entries(rules)) { const v = typeof i.money[k] === 'string' ? i.money[k].trim() : ''; if (!v) continue; if (ok(v)) m[k] = v; else notes.push(`${k} was not saved (it does not look right)`); }
    out.money = m;
  }
  return { config: out, notes };
}

/** One request written as an issue title ("truth: research …") → what to do + what to answer. */
function handle(store, title, body) {
  const m = String(title || '').match(/^\s*truth:\s*([a-z]+)\s*(.*)$/i); if (!m) return null;
  const verb = m[1].toLowerCase(); const rest = m[2].trim(); const text = String(body || '');
  if (verb === 'research') {
    const subject = (text.match(/subject:\s*([a-z]+)/i) || [])[1] || 'psychology'; const t = addRequest(store, rest, { subject, by: 'studio' });
    return t ? { count: 1, writer: true, kind: 'research', topic: t, reply: `Researching “${t}” now. If solid studies exist, the file appears in the studio when this run ends. If not, it shows under “Dropped for lack of proof” with the reason.` } : { reply: 'That topic was too short to research. Write the question out in a few more words.' };
  }
  if (verb === 'make') {
    const n = Math.max(1, Math.min(24, parseInt(rest, 10) || 1)); const subject = (rest.match(/\d+\s+([a-z]+)/i) || [])[1]; const ok = subject && SUBJECTS[subject.toLowerCase()];
    return { count: n, subject: ok ? subject.toLowerCase() : '', writer: true, kind: 'make', reply: `Making ${n} new file${n === 1 ? '' : 's'}${ok ? ` about ${SUBJECTS[subject.toLowerCase()].toLowerCase()}` : ''}. Each one takes about a quarter of an hour; they appear in the studio when the run ends.` };
  }
  if (verb === 'settings' || verb === 'config') {
    let json = null; const block = text.match(/```(?:json)?\s*([\s\S]*?)```/); try { json = JSON.parse(block ? block[1] : text); } catch { json = null; }
    if (!json) return { reply: 'I could not read the settings in this request, so nothing was changed.' };
    const { config, notes } = cleanConfig(json, store.config); store.config = config;
    return { rebuild: true, reply: `Settings saved.${notes.length ? ' ' + notes.join('. ') + '.' : ''} They are live now.` };
  }
  if (verb === 'rewrite') {
    const [id, slide] = rest.split(/\s+/); const note = (text.match(/note:\s*(.+)/i) || [])[1] || '';
    if (!store.has(id) || !SLIDES.includes(slide)) return { reply: 'I could not find that file or slide, so nothing was rewritten.' };
    (store.topics.rewrites ||= []).push({ id, slide, note: note.trim().slice(0, 300), at: new Date().toISOString() });
    return { writer: true, kind: 'rewrite', id, slide, reply: `Writing new versions of that slide from the same checked facts. Open the file in the studio and tap “Another version” when this run ends.` };
  }
  if (verb === 'remove' || verb === 'restore') {
    const p = store.index.posts.find((x) => x.id === rest); if (!p) return { reply: 'I could not find that file.' };
    const hide = verb === 'remove'; p.hidden = hide; const full = store.post(p.id); if (full) { full.hidden = hide; fs.writeFileSync(store.postPath(p.id), JSON.stringify(full)); }
    return { rebuild: true, reply: hide ? 'That file is off the website. It stays in your studio library.' : 'That file is back on the website.' };
  }
  return { reply: `I do not know the request “${verb}”. Nothing was changed.` };
}

/** Decide what this run does: scheduled run, a run started by hand, or requests sent from the studio as issues. */
function plan() {
  const store = new Store(opt('store', 'store')); const event = process.env.EVENT || 'workflow_dispatch'; const owner = (process.env.OWNER || '').toLowerCase();
  let count = 0, subject = '', writer = false; const answers = [];
  const issuesFile = opt('issues', ''); const issues = issuesFile && fs.existsSync(issuesFile) ? JSON.parse(fs.readFileSync(issuesFile, 'utf8')) : [];
  for (const is of Array.isArray(issues) ? issues : []) {
    if (is.pull_request || (owner && String(is.user?.login || '').toLowerCase() !== owner)) continue;              // only the owner's own requests count
    const r = handle(store, is.title, is.body); if (!r) continue;
    count += r.count || 0; if (r.subject) subject = r.subject; if (r.writer) writer = true; answers.push({ number: is.number, reply: r.reply, kind: r.kind || '', topic: r.topic || '', id: r.id || '', slide: r.slide || '' });
  }
  if (event === 'schedule') { count += Math.max(1, Math.ceil((store.config.daily || 6) / RUNS_PER_DAY)); writer = true; }
  if (event === 'workflow_dispatch') {
    const n = parseInt(process.env.INPUT_COUNT ?? '3', 10); count += Number.isFinite(n) ? Math.max(0, Math.min(24, n)) : 3; subject = SUBJECTS[process.env.INPUT_SUBJECT] ? process.env.INPUT_SUBJECT : subject;
    if (process.env.INPUT_TOPIC) { addRequest(store, process.env.INPUT_TOPIC, { subject: subject || 'psychology', by: 'manual' }); count = Math.max(count, 1); }
    writer = count > 0;
  }
  if ((store.topics.rewrites || []).length) writer = true;
  count = Math.min(24, count); store.save();
  fs.writeFileSync(path.join(store.dir, 'answers.json'), JSON.stringify(answers));
  const minutes = Math.min(330, Math.max(40, count * 22 + 20));
  const outputs = { count, subject, writer: writer ? 'true' : 'false', minutes, answers: answers.length };
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(outputs).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
  log('plan:', JSON.stringify(outputs));
}

// ------------------------------------------------------------------------------------------------ run
async function run() {
  const store = new Store(opt('store', 'store')); const count = Number(opt('count', 4)); const minutes = Number(opt('minutes', 300)); const withImages = !!opt('images', false);
  const t0 = Date.now(); const deadline = t0 + minutes * 60e3; const llm = active();
  if (!llm) { log('no AI writer is available — nothing to do'); process.exitCode = 2; return; }
  log(`engine ${ENGINE_VERSION} · writer ${llm.name}:${llm.model} · target ${count} post(s) in ${minutes} min · ${store.index.posts.length} in the library · ${runway(store)} topics waiting`);
  // slide rewrites Ash asked for come first: they are quick and he is waiting for them
  const rewrites = store.topics.rewrites || []; store.topics.rewrites = []; let rewritten = 0;
  for (const rw of rewrites) {
    const post = store.post(rw.id); if (!post) continue;
    try { const r = await alternates(post, rw.slide, { note: rw.note }); log(`rewrite ${rw.id} ${rw.slide}: ${r.ok ? r.added + ' new version(s)' : r.error}${r.dropped?.length ? ` (dropped: ${r.dropped.join('; ')})` : ''}`); if (r.ok && r.added) { fs.writeFileSync(store.postPath(rw.id), JSON.stringify(post)); rewritten += r.added; } } catch (e) { log('rewrite failed:', e.message); }
  }
  const queue = count > 0 ? nextTopics(store, count * 3, { subject: opt('subject', '') }) : []; const made = [], failed = []; let longest = 0;
  for (const t of queue) {
    if (made.length >= count) break;
    const left = deadline - Date.now(); if (left < Math.max(8 * 60e3, longest * 1.25)) { log('time budget reached'); break; }
    const p0 = Date.now(); let r;
    try { r = await makePost({ ...t, intensity: store.config.intensity || 2, avoid: store.headlines() }); } catch (e) { r = { ok: false, reason: 'crash: ' + (e.message || e) }; }
    longest = Math.max(longest, Date.now() - p0);
    if (!r.ok) {
      const offline = (r.trace?.research?.search?.errors || []).length > 0 && !(r.trace?.research?.sources || []).length;      // the search services were down: try this topic again another day
      const reason = offline ? 'search services unavailable' : r.reason; const trace = saveTrace(store, t, r);
      failed.push({ topic: t.topic, reason }); if (!offline) markTopic(store, t, 'failed', { reason: String(r.reason).slice(0, 300), trace }); store.save(); continue;
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
  if (count > 0 && runway(store) < 24 && deadline - Date.now() > 6 * 60e3) { const cov = coverage(store); const thin = Object.keys(cov).sort((a, b) => cov[a] - cov[b])[0]; const b = await brainstorm(store, thin); log(`brainstorm (${thin}): ${b.ok ? b.added + ' new idea(s)' : b.error}`); }
  if (count > 0 || rewritten) {
    const runRec = { at: new Date(t0).toISOString(), seconds: Math.round((Date.now() - t0) / 1000), made: made.length, failed: failed.length, rewritten, posts: made, failures: failed.slice(0, 8), writer: `${llm.name}:${llm.model}`, version: ENGINE_VERSION, http: { requests: httpStats.requests, failures: httpStats.failures } };
    if (count > 0) store.engine.runs = [runRec, ...(store.engine.runs || [])].slice(0, 40);
    store.engine.totals = { made: (store.engine.totals?.made || 0) + made.length, failed: (store.engine.totals?.failed || 0) + failed.length };
  }
  store.engine.writer = { provider: llm.name, model: llm.model, free: !!llm.free };
  store.engine.providers = Object.fromEntries(Object.entries(providers()).filter(([k]) => k !== 'mock').map(([k, v]) => [k, { ready: v.ready, model: v.model, free: v.free }]));
  store.save(); log(`done: ${made.length} made, ${failed.length} failed, ${rewritten} slide version(s) added`);
  // requests from the studio get an answer that says what actually happened
  const af = path.join(store.dir, 'answers.json');
  if (fs.existsSync(af)) {
    const answers = JSON.parse(fs.readFileSync(af, 'utf8'));
    for (const a of answers) {
      if (a.kind === 'research') { const rq = store.topics.requests.find((x) => x.topic === a.topic); if (rq?.status === 'done') a.reply = `Done. “${a.topic}” is in your studio as a new file.`; else if (rq?.status === 'failed') a.reply = `I researched “${a.topic}” but could not prove enough to publish it (${rq.reason || 'not enough solid evidence'}). It is listed in the studio under “Dropped for lack of proof”.`; else a.reply = `“${a.topic}” is still in line. This run ended before reaching it; the next run starts with it.`; }
      if (a.kind === 'make') a.reply = `Made ${made.length} new file${made.length === 1 ? '' : 's'}${failed.length ? `; ${failed.length} topic${failed.length === 1 ? ' was' : 's were'} dropped for lack of proof` : ''}. They are in your studio now.`;
      if (a.kind === 'rewrite') { const n = (store.post(a.id)?.alts?.[a.slide] || []).length; a.reply = n ? `Done. Open the file in the studio, go to that slide and tap “Another version”. ${n} version${n === 1 ? ' is' : 's are'} waiting.` : 'The writer did not produce a version that passed the fact checks this time. Nothing was changed.'; }
    }
    fs.writeFileSync(af, JSON.stringify(answers));
  }
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### THE TRUTH engine\n- made: ${made.length}\n- failed: ${failed.length}\n${failed.map((f) => `  - ${f.topic}: ${f.reason}`).join('\n')}\n`);
}

/** Keep the research trail for each attempt (what was searched, which claims were rejected and why). → trace id */
function saveTrace(store, t, r, postId = null) {
  const id = postId || `failed-${new Date().toISOString().slice(0, 10)}-${slug(t.topic, 40)}`; const f = path.join(store.data, 'trace', id + '.json');
  fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify({ id, ok: !!r.ok, reason: r.reason || '', topic: t.topic, subject: t.subject, at: new Date().toISOString(), ...r.trace })); return id;
}

function copyDir(from, to, skip = () => false) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) { const a = path.join(from, e.name), b = path.join(to, e.name); if (skip(a)) continue; if (e.isDirectory()) copyDir(a, b, skip); else fs.copyFileSync(a, b); }
}

// ------------------------------------------------------------------------------------------------ build
async function build() {
  const store = new Store(opt('store', 'store')); const out = opt('out', 'dist'); const repo = process.env.GITHUB_REPOSITORY || 'swagbb8/Smash-radar'; const [owner, name] = repo.split('/');
  // facts the studio shows about the engine itself
  store.engine.runway = runway(store); store.engine.coverage = coverage(store);
  store.engine.queue = nextTopics(store, 12, { seed: new Date().toISOString().slice(0, 10) }).map((t) => ({ subject: t.subject, style: t.style, topic: t.topic, origin: t.origin || 'seed' }));
  store.engine.schedule = `It runs by itself ${RUNS_PER_DAY} times a day.`;
  store.config.site = store.config.domain ? `https://${store.config.domain}/` : `https://${owner.toLowerCase()}.github.io/${name}/`; store.config.owner = owner.toLowerCase();
  // covers are redrawn when the slide design changes, so the library always matches what the studio draws
  const { renderThumb, RENDER_VERSION } = await import('./render-node.mjs');
  if (store.engine.thumbs !== RENDER_VERSION) { let n = 0; for (const p of store.index.posts) { const post = store.post(p.id); if (!post) continue; try { await renderThumb(post, path.join(store.data, 'thumb', p.id + '.jpg'), { imageDir: store.dir }); n++; } catch (e) { log('thumbnail failed:', p.id, e.message); } } store.engine.thumbs = RENDER_VERSION; log(`redrew ${n} cover(s)`); }
  store.save();
  copyDir(path.join(ROOT, 'app'), out); copyDir(store.data, path.join(out, 'data'));
  fs.writeFileSync(path.join(out, '.nojekyll'), ''); fs.writeFileSync(path.join(out, '.truth'), 'THE TRUTH\n'); if (store.config.domain) fs.writeFileSync(path.join(out, 'CNAME'), store.config.domain + '\n');
  // a repeating calendar reminder the studio links to (phones open .ics files in the calendar app)
  for (const h of ['09', '12', '18', '20']) fs.writeFileSync(path.join(out, 'studio', `reminder-${h}.ics`), ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//The Truth//Studio//EN', 'BEGIN:VEVENT', `UID:truth-daily-${h}@the-truth`, `DTSTAMP:${new Date().toISOString().replace(/[-:]|\.\d+/g, '')}`, `DTSTART:${new Date().toISOString().slice(0, 10).replace(/-/g, '')}T${h}0000`, 'DURATION:PT10M', 'RRULE:FREQ=DAILY', 'SUMMARY:Post today’s file', `DESCRIPTION:Open The Truth studio and tap Share. ${store.config.site}studio/`, 'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY', 'DESCRIPTION:Post today’s file', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n'));
  let site = false;
  try { const { buildSite } = await import('./site.mjs'); await buildSite(store, out, { repo }); site = true; } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; }
  if (!site) fs.writeFileSync(path.join(out, 'index.html'), '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#000000"><title>The Truth</title><link rel="manifest" href="manifest.webmanifest"><link rel="apple-touch-icon" href="icons/apple-touch-icon.png"><style>html{background:#000;color:#f3f1ec;font:16px system-ui}a{color:inherit}</style><script>location.replace("studio/")</script><p style="padding:24px"><a href="studio/">Open the studio</a></p></html>');
  const version = { built: new Date().toISOString(), engine: ENGINE_VERSION, posts: store.index.posts.length, commit: process.env.GITHUB_SHA || '', repo, owner, site }; fs.writeFileSync(path.join(out, 'version.json'), JSON.stringify(version));
  log(`built ${out}: ${store.index.posts.length} post(s)${site ? ', website included' : ''}`);
}

function request() { const store = new Store(opt('store', 'store')); const t = addRequest(store, opt('topic', process.env.TRUTH_TOPIC || ''), { subject: opt('subject', 'psychology'), style: opt('style', 'uncomfortable'), by: opt('by', '') }); if (!t) { log('topic too short'); process.exitCode = 1; return; } store.save(); log('request queued:', t); }
function status() { const s = new Store(opt('store', 'store')); console.log(JSON.stringify({ posts: s.index.posts.length, runway: runway(s), coverage: coverage(s), last: s.engine.runs?.[0] || null }, null, 1)); }

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await ({ plan, run, build, request, status }[cmd] || (() => { console.log('usage: cli.mjs plan|run|build|request|status --store DIR …'); process.exitCode = 1; }))();
