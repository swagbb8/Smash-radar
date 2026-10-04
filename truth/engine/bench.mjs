// Model benchmark: run real topics through the full production line and record speed, grounding and the written post,
// so writers can be compared on a GitHub runner.   BENCH_NAME, BENCH_TOPICS (how many), BENCH_PICK (comma indexes)
import fs from 'node:fs';
import { makePost } from './pipeline.mjs';
import { active } from './llm/index.mjs';
import { stats } from './lib/http.mjs';

export const TOPICS = [
  { topic: 'Your phone weakens your thinking even when you are not using it', angle: 'The mere presence of a smartphone drains attention and working memory', style: 'hijacked', subject: 'technology', queries: ['mere presence smartphone cognitive capacity', 'smartphone presence working memory attention'] },
  { topic: 'What one bad night of sleep does to your emotions', angle: 'Sleep loss makes the emotional brain overreact and weakens self-control', style: 'darkside', subject: 'brain', queries: ['sleep deprivation amygdala emotional reactivity', 'sleep loss emotion regulation meta-analysis'] },
  { topic: 'Being short of money changes how well you think', angle: 'Financial scarcity itself consumes mental capacity, separate from education or effort', style: 'unseen', subject: 'money', queries: ['poverty impedes cognitive function scarcity', 'financial scarcity cognitive load decision making'] },
  { topic: 'Does quitting social media actually make people happier?', angle: 'Experiments where people cut social media show smaller benefits than headlines suggest', style: 'reality', subject: 'social', queries: ['social media abstinence well-being randomized experiment', 'reducing social media use depression loneliness trial'] },
];
const name = process.env.BENCH_NAME || 'model'; const out = { name, at: new Date().toISOString(), llm: active(), runs: [] };
const pick = process.env.BENCH_PICK ? process.env.BENCH_PICK.split(',').map(Number) : [...Array(Math.min(TOPICS.length, Number(process.env.BENCH_TOPICS || 2))).keys()];
fs.mkdirSync('bench-out', { recursive: true });
for (const i of pick) {
  const r = await makePost(TOPICS[i]).catch((e) => ({ ok: false, reason: 'crash: ' + (e.stack || e) }));
  out.runs.push({ index: i, ok: r.ok, reason: r.reason, seconds: Math.round((r.ms || 0) / 1000), post: r.post, trace: r.trace, carousel: r.ok ? undefined : r.carousel });
  out.http = stats; fs.writeFileSync(`bench-out/${name}.json`, JSON.stringify(out, null, 1));
  if (r.ok) fs.writeFileSync(`bench-out/${name}.post${i}.json`, JSON.stringify(r.post, null, 1));
}
