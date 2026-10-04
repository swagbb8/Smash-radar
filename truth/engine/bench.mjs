// Model benchmark: run two real topics through search → evidence extraction → grounding checks → carousel writing,
// and record speed + output so models can be compared on a GitHub runner.
import fs from 'node:fs';
import * as epmc from './sources/europepmc.mjs';
import * as oalex from './sources/openalex.mjs';
import { chat, active } from './llm/index.mjs';
import { claimsPrompt, carouselPrompt } from './prompts.mjs';
import { checkClaim } from './ground.mjs';

const TOPICS = [
  { topic: 'Your phone weakens your thinking even when you are not using it', angle: 'The mere presence of a smartphone drains attention and working memory', style: 'hijacked', query: 'smartphone presence cognitive capacity attention working memory', oa: 'mere presence smartphone cognitive capacity' },
  { topic: 'What one bad night of sleep does to your emotions', angle: 'Sleep loss makes the emotional brain overreact and weakens self-control', style: 'darkside', query: 'sleep deprivation amygdala emotional reactivity prefrontal', oa: 'sleep deprivation amygdala reactivity emotion regulation' },
];
const name = process.env.BENCH_NAME || 'model'; const out = { name, at: new Date().toISOString(), llm: active(), topics: [] };
const rank = (s) => ({ 'meta-analysis': 5, 'systematic-review': 4.5, rct: 4, experiment: 3.5, review: 3, trial: 3, study: 2.5, observational: 2.2, preprint: 1 }[s.type] || 2) + Math.min(3, Math.log10(1 + s.citedBy));

for (const T of TOPICS.slice(0, Number(process.env.BENCH_TOPICS || 2))) {
  const rec = { topic: T.topic };
  const [a, b] = await Promise.all([epmc.search(T.query, { limit: 14 }), oalex.search(T.oa, { limit: 10 })]);
  const seen = new Set(); const pool = [...a.items, ...b.items].filter((s) => (seen.has(s.key) ? false : seen.add(s.key)));
  const sources = pool.sort((x, y) => rank(y) - rank(x)).slice(0, 6);
  rec.search = { epmc: a.items.length, openalex: b.items.length, errors: [a.error, b.error].filter(Boolean) };
  rec.sources = sources.map((s, i) => ({ tag: 'S' + (i + 1), title: s.title, year: s.year, type: s.type, venue: s.venue, citedBy: s.citedBy, url: s.url, abstractChars: s.abstract.length }));
  if (!sources.length) { rec.error = 'no sources'; out.topics.push(rec); continue; }

  const p1 = claimsPrompt({ topic: T.topic, angle: T.angle, sources });
  const r1 = await chat({ ...p1, maxTokens: 900, temperature: 0.3 });
  rec.claims = { ok: r1.ok, error: r1.error, ms: r1.ms, timings: r1.timings, usage: r1.usage, finish: r1.finish, raw: r1.ok ? undefined : (r1.text || '').slice(0, 1500), promptChars: p1.user.length };
  const claims = (r1.json?.claims || []).map((c) => { const idx = Number(String(c.source).replace(/\D/g, '')) - 1; const src = sources[idx]; return { ...c, check: checkClaim(c, src) }; });
  rec.claims.items = claims; rec.claims.verdict = r1.json?.verdict; rec.claims.caveat = r1.json?.caveat; rec.claims.passed = claims.filter((c) => c.check.ok).length;

  const good = claims.filter((c) => c.check.ok).slice(0, 6);
  if (good.length >= 2) {
    const facts = good.map((c) => { const s = sources[Number(String(c.source).replace(/\D/g, '')) - 1]; return { claim: c.claim, label: `${s.type}, ${s.year}, ${c.strength} evidence` }; });
    const p2 = carouselPrompt({ topic: T.topic, angle: T.angle, style: T.style, facts, verdict: r1.json.verdict, caveat: r1.json.caveat, intensity: 2 });
    const r2 = await chat({ ...p2, maxTokens: 1100, temperature: 0.75 });
    rec.carousel = { ok: r2.ok, error: r2.error, ms: r2.ms, timings: r2.timings, usage: r2.usage, finish: r2.finish, json: r2.json, raw: r2.ok ? undefined : (r2.text || '').slice(0, 1500), promptChars: p2.user.length };
  } else rec.carousel = { skipped: 'fewer than 2 grounded claims' };
  out.topics.push(rec);
  console.log(`[${name}] ${T.topic}: claims ${rec.claims.passed}/${claims.length} grounded in ${Math.round(r1.ms / 1000)}s, carousel ${rec.carousel?.ok ? 'ok' : 'no'} in ${Math.round((rec.carousel?.ms || 0) / 1000)}s`);
}
fs.mkdirSync('bench-out', { recursive: true }); fs.writeFileSync(`bench-out/${name}.json`, JSON.stringify(out, null, 1));
