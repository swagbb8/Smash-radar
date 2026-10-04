// Topic desk: decides what the engine investigates next.
//   1. topics Ash asked for (requests)   2. ideas the AI proposed on earlier runs   3. the editorial seed list
// Subjects are balanced so the feed never becomes one note, and nothing already covered is repeated.
import { SEEDS, SUBJECTS } from './seeds.mjs';
import { chat } from './llm/index.mjs';
import { STYLES } from './prompts.mjs';
import { rngFrom } from './lib/rand.mjs';

export function coverage(store) { const c = Object.fromEntries(Object.keys(SUBJECTS).map((k) => [k, 0])); for (const p of store.index.posts) if (p.subject in c) c[p.subject]++; return c; }

/** The next `n` topics to try, best first. */
export function nextTopics(store, n, { subject = '', seed = Date.now() } = {}) {
  const out = []; const used = store.topics.used; const rand = rngFrom(seed);
  for (const r of store.topics.requests.filter((r) => r.status === 'waiting')) out.push({ ...r, key: r.key, origin: 'request' });
  const pool = [...store.topics.ideas.filter((t) => !used[t.key]), ...SEEDS.filter((s) => !used[s.key])].filter((t) => (!subject || t.subject === subject) && !store.isRepeat(t.topic));
  const cov = coverage(store); const bySubject = {};
  for (const t of pool) (bySubject[t.subject] ||= []).push(t);
  for (const list of Object.values(bySubject)) list.sort((a, b) => (a.origin === 'idea' ? -1 : 0) - (b.origin === 'idea' ? -1 : 0) || rand() - 0.5);
  while (out.length < n) {
    const subjects = Object.keys(bySubject).filter((s) => bySubject[s].length); if (!subjects.length) break;
    subjects.sort((a, b) => cov[a] - cov[b] || rand() - 0.5); const s = subjects[0]; out.push(bySubject[s].shift()); cov[s]++;
  }
  return out.slice(0, n);
}

export function markTopic(store, t, status, extra = {}) {
  store.topics.used[t.key] = { status, at: new Date().toISOString(), topic: t.topic, subject: t.subject, ...extra };
  const r = store.topics.requests.find((x) => x.key === t.key); if (r) Object.assign(r, { status, ...extra });
}

/** How many untouched topics are left (so the studio can show the runway). */
export function runway(store) { return SEEDS.filter((s) => !store.topics.used[s.key]).length + store.topics.ideas.filter((t) => !store.topics.used[t.key]).length; }

/** Ask the AI writer for fresh questions in one subject. Ideas only become posts if the evidence desk finds studies for them. */
export async function brainstorm(store, subject, count = 6) {
  const have = [...store.index.posts.filter((p) => p.subject === subject).map((p) => p.topic), ...SEEDS.filter((s) => s.subject === subject).map((s) => s.topic), ...store.topics.ideas.filter((t) => t.subject === subject).map((t) => t.topic)];
  const schema = { type: 'object', additionalProperties: false, required: ['ideas'], properties: { ideas: { type: 'array', minItems: count, maxItems: count, items: { type: 'object', additionalProperties: false, required: ['topic', 'angle', 'style', 'query1', 'query2'],
    properties: { topic: { type: 'string' }, angle: { type: 'string' }, style: { type: 'string', enum: Object.keys(STYLES) }, query1: { type: 'string' }, query2: { type: 'string' } } } } } };
  const user = `SUBJECT: ${SUBJECTS[subject]}

Propose ${count} new questions for THE TRUTH, a publication that shows people how the modern world really works, using published research.
Each one must be about something that has actually been studied (experiments, large surveys, meta-analyses, official data), and must surprise or unsettle an ordinary reader.
Good questions include well-known claims that later research overturned.

For each give:
- "topic": the question or statement as a plain headline, 6 to 14 words.
- "angle": one sentence saying what you expect the evidence to show.
- "style": one of ${Object.entries(STYLES).map(([k, v]) => `${k} (${v.name.toLowerCase()})`).join(', ')}.
- "query1" and "query2": two different keyword searches (3 to 6 words each) that would find the key studies in a scholarly database. Use the technical terms researchers use.

Already covered — do not repeat these or close variants:
${have.slice(0, 60).map((t) => '- ' + t).join('\n')}

Return JSON only.`;
  const r = await chat({ system: 'You are the commissioning editor of THE TRUTH. You only commission questions that real research can answer.', user, schema, schemaName: 'ideas', maxTokens: 900, temperature: 0.9 });
  if (!r.ok) return { ok: false, error: r.error, added: 0 };
  let added = 0;
  for (const it of r.json.ideas || []) {
    if (!it.topic || store.isRepeat(it.topic) || have.some((h) => h.toLowerCase() === it.topic.toLowerCase())) continue;
    store.topics.ideas.push({ key: 'idea:' + Date.now().toString(36) + added, origin: 'idea', subject, style: it.style, topic: it.topic.trim(), angle: it.angle.trim(), queries: [it.query1, it.query2].filter(Boolean), created: new Date().toISOString() }); added++;
  }
  return { ok: true, added, ms: r.ms };
}
