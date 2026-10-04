// Model benchmark: run the real research -> claims -> carousel path on three topics and record speed + output quality.
import fs from 'node:fs';
import { findEvidence } from './sources/index.mjs';
import { extractClaims, writeCarousel } from './write.mjs';
import { log } from './lib/util.mjs';

const TOPICS = [
  { topic: 'Just having your phone near you drains your thinking power, even when it is switched off', style: 'hijacked', queries: ['smartphone presence cognitive capacity', 'mere presence of smartphone attention working memory'] },
  { topic: 'What one bad night of sleep does to the emotional centres of your brain', style: 'uncomfortable', queries: ['sleep deprivation amygdala emotional reactivity', 'sleep loss emotion regulation'] },
  { topic: 'Does cutting down social media actually make people less lonely and depressed?', style: 'reality', queries: ['limiting social media use loneliness depression experiment', 'social media abstinence well-being randomized'] },
];
const out = { model: process.env.LLM_MODEL_NAME, at: new Date().toISOString(), runs: [] };
const pick = (process.env.BENCH_TOPICS || '0,1,2').split(',').map(Number);
for (const i of pick) {
  const T = TOPICS[i]; const run = { topic: T.topic, style: T.style }; const t0 = Date.now();
  try {
    const sources = await findEvidence(T.queries, { max: 8 }); run.sources = sources.map((s) => ({ id: s.id, title: s.title, year: s.year, venue: s.venue, design: s.grade.design, level: s.grade.level, cited: s.cited_by, rel: +s.rel.toFixed(2), chars: s.text.length, url: s.url, provider: s.provider }));
    log(`${T.topic.slice(0, 40)}…: ${sources.length} sources`);
    const ex = await extractClaims(T.topic, sources); run.extract = { belief: ex.belief, angle: ex.angle, claims: ex.claims, rejected: ex.rejected, llm: ex.llm };
    log(`claims ok ${ex.claims.length}, rejected ${ex.rejected.length}, ${Math.round(ex.llm.ms / 1000)}s`);
    if (ex.claims.length >= 2) { const c = await writeCarousel({ topic: T.topic, angle: ex.angle, belief: ex.belief, style: T.style, claims: ex.claims, sources }); run.carousel = c; log(`carousel written in ${Math.round(c.llm.ms / 1000)}s, lint issues ${c.lint.length}`); }
  } catch (e) { run.error = String(e.stack || e).slice(0, 1200); log('ERROR', e.message); }
  run.total_s = Math.round((Date.now() - t0) / 1000); out.runs.push(run);
  fs.mkdirSync('bench-out', { recursive: true }); fs.writeFileSync('bench-out/bench.json', JSON.stringify(out, null, 1));
}
