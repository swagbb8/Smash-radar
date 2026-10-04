// Builds a small demo library for local previews and tests (never deployed):
//   node engine/dev-store.mjs <storeDir> [post.json …]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './store.mjs';
import { renderThumb } from './render-node.mjs';
import { markTopic, runway, coverage, nextTopics } from './discover.mjs';
import { SEEDS } from './seeds.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [, , dir = 'dev-store', ...files] = process.argv;
fs.rmSync(dir, { recursive: true, force: true }); const store = new Store(dir);
const base = [path.join(ROOT, 'tests/fixtures/sample-post.json'), ...files].filter((f) => fs.existsSync(f)).map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
const VARIANTS = [
  { subject: 'brain', style: 'uncomfortable' }, { subject: 'social', style: 'darkside' }, { subject: 'money', style: 'unseen' }, { subject: 'health', style: 'reality' },
  { subject: 'future', style: 'future' }, { subject: 'history', style: 'think' }, { subject: 'psychology', style: 'hijacked' },
];
let k = 0; const day = (n) => new Date(Date.now() - n * 86400e3).toISOString();
for (const p of base) { const { n, sample, ...post } = p; post.created = day(base.length - k); post.credibility ||= { score: 88, flags: ['Rests on a single source'] }; post.caption ||= 'A silent phone is still doing something to you.\n\nSave this for the next time you sit down to work.'; post.hashtags?.length || (post.hashtags = ['psychology', 'attention', 'smartphones']);
  const full = store.addPost(post); await renderThumb(full, path.join(store.data, 'thumb', full.id + '.jpg')); k++; }
for (const [i, v] of VARIANTS.entries()) {
  const src = base[i % base.length]; const seed = SEEDS.filter((s) => s.subject === v.subject)[i % 3]; const { n, sample, ...post } = JSON.parse(JSON.stringify(src));
  Object.assign(post, { id: `demo-${v.subject}-${i}`, created: day(i * 0.4), subject: v.subject, style: v.style, topic: seed.topic, title: seed.topic, hook: i % Math.max(1, post.hooks.length), credibility: { score: 70 + ((i * 7) % 28), flags: i % 2 ? ['No meta-analysis or systematic review among the sources'] : [] } });
  post.hooks = [{ text: seed.topic, type: 'statement' }, ...post.hooks.slice(0, 3)]; post.hook = 0;
  const full = store.addPost(post); await renderThumb(full, path.join(store.data, 'thumb', full.id + '.jpg'));
  fs.mkdirSync(path.join(store.data, 'trace'), { recursive: true });
  fs.writeFileSync(path.join(store.data, 'trace', full.id + '.json'), JSON.stringify({ id: full.id, ok: true, topic: post.topic, subject: post.subject, at: post.created,
    research: { ok: true, search: { found: 214, relevant: 9, errors: [] }, sources: (post.sources || []).map((s) => ({ ...s, citedBy: 1820, rel: 0.9 })), facts: (post.claims || []).map((c) => ({ id: c.id, claim: c.text, source: c.source, quote: c.quote, level: c.level })), rejected: [{ claim: 'Phones cut test scores by 40% in every student.', source: 'S1', quote: 'reduced scores by 40%', reason: 'quote not found in the source' }], supports: 'yes', verdict: post.verdict || 'The effect was found in two experiments.', caveat: post.caveat || 'Later replications found smaller effects.' },
    write: { ok: true, drafts: 2, fixes: ['dropped 1 hook(s)'], issues: [{ where: 'example.body', kind: 'length', severity: 'medium', detail: '54 words' }] } }));
}
const failed = SEEDS.find((s) => s.subject === 'science'); markTopic(store, failed, 'failed', { reason: 'only 1 claim(s) survived the grounding checks', trace: 'failed-demo' });
fs.writeFileSync(path.join(store.data, 'trace', 'failed-demo.json'), JSON.stringify({ id: 'failed-demo', ok: false, reason: 'only 1 claim(s) survived the grounding checks', topic: failed.topic, subject: failed.subject, at: day(0.2), research: { ok: false, search: { found: 96, relevant: 3, errors: [] }, sources: [], facts: [], rejected: [{ claim: 'A claim the writer could not prove.', source: 'S2', quote: '…', reason: 'numbers not in the source: 73%' }] } }));
store.topics.requests.push({ key: 'req:demo', origin: 'request', status: 'waiting', subject: 'psychology', style: 'reality', topic: 'Does background music help you study?', angle: '', queries: ['background music studying'], created: day(0) });
store.engine.runs = [{ at: day(0.1), seconds: 2140, made: 3, failed: 1, posts: store.index.posts.slice(0, 3).map((p) => p.id), failures: [{ topic: failed.topic, reason: 'only 1 claim(s) survived the grounding checks' }], writer: 'local:gemma-4-12b', version: 'dev' }];
store.engine.totals = { made: store.index.posts.length, failed: 1 }; store.engine.writer = { provider: 'local', model: 'gemma-4-12b', free: true }; store.engine.runway = runway(store); store.engine.coverage = coverage(store);
store.engine.queue = nextTopics(store, 12, { seed: 7 }).map((t) => ({ subject: t.subject, style: t.style, topic: t.topic, origin: t.origin || 'seed' })); store.engine.schedule = 'It runs by itself every 6 hours.';
store.engine.providers = { anthropic: { ready: false }, gemini: { ready: false }, groq: { ready: false }, openai: { ready: false }, local: { ready: true, model: 'gemma-4-12b', free: true } };
store.save(); console.log(`demo store: ${store.index.posts.length} posts in ${dir}`);
