// The production line for one post:
//   question → evidence search → claims with exact quotes (AI) → grounding checks (code) → carousel (AI)
//   → lint → one corrective rewrite if needed → hard fixes → a post that carries its own proof.
// Nothing reaches a slide unless a quote for it was found in a real source.
import { gather, digest, citeOf } from './sources/index.mjs';
import { chat, active } from './llm/index.mjs';
import { claimsPrompt, carouselPrompt, STYLES } from './prompts.mjs';
import { checkClaim, sanitizeCarousel, lintCarousel, hardFix, soundsCausal } from './ground.mjs';
import { slug, clean } from './lib/text.mjs';

export const ENGINE_VERSION = '0.3';
const KIND = { 'meta-analysis': 'meta-analysis', 'systematic-review': 'systematic review', rct: 'randomized trial', trial: 'clinical trial', experiment: 'experiment', review: 'review', observational: 'observational study', preprint: 'preprint', study: 'study', data: 'official data', encyclopedia: 'background' };
const log = (...a) => console.log(`[truth ${new Date().toISOString().slice(11, 19)}]`, ...a);

/** Stage 1+2: find sources, extract claims, keep only the ones whose quote and numbers check out. */
export async function research({ topic, angle, queries, maxSources = 6, gatherOpts = {} }) {
  const g = await gather(queries, { max: maxSources, ...gatherOpts }); const out = { sources: g.sources, search: g.stats, facts: [], rejected: [] };
  if (g.sources.length < 2) return { ...out, ok: false, reason: `only ${g.sources.length} relevant source(s) found` };
  const p = claimsPrompt({ topic, angle, sources: g.sources, digest }); const r = await chat({ ...p, maxTokens: 1100, temperature: 0.25 });
  out.llm = { ms: r.ms, timings: r.timings, usage: r.usage, finish: r.finish };
  if (!r.ok) return { ...out, ok: false, reason: 'evidence extraction failed: ' + r.error, raw: (r.text || '').slice(0, 800) };
  const byId = Object.fromEntries(g.sources.map((s) => [s.id, s])); const seen = [];
  for (const c of r.json.claims || []) {
    const src = byId[c.source]; const check = checkClaim(c, src); const claim = clean(c.claim);
    const dup = seen.some((t) => t === claim.toLowerCase());
    if (!check.ok || dup || claim.split(' ').length < 5) { out.rejected.push({ claim, source: c.source, quote: c.quote, reason: dup ? 'duplicate' : check.reason || 'too short' }); continue; }
    seen.push(claim.toLowerCase());
    out.facts.push({ claim, source: c.source, quote: clean(c.quote), surprise: c.surprise, level: src.level === 'background' ? 'supported' : src.level, causalOk: !!src.causal || !check.causal, causalWarning: check.causal || null, quoteExact: check.quoteExact });
  }
  out.facts.sort((a, b) => (b.surprise || 0) - (a.surprise || 0)); out.facts = out.facts.slice(0, 6).map((f, i) => ({ id: 'F' + (i + 1), ...f }));
  Object.assign(out, { supports: r.json.supports || 'yes', angle: clean(r.json.angle) || angle, verdict: clean(r.json.verdict), caveat: clean(r.json.caveat) });
  if (out.facts.length < 2) return { ...out, ok: false, reason: `only ${out.facts.length} claim(s) survived the grounding checks` };
  return { ...out, ok: true };
}

/** Stage 3: write, lint, rewrite once if needed, then cut anything that still cannot be proven. */
export async function write({ topic, style, intensity = 2, avoid = [] }, R) {
  const byId = Object.fromEntries(R.sources.map((s) => [s.id, s]));
  const facts = R.facts.map((f) => { const s = byId[f.source]; return { ...f, label: `${KIND[s.type] || 'study'}, ${s.year || 'n.d.'}; evidence: ${f.level}${f.causalOk ? '' : '; shows a link only, so no cause-and-effect words'}` }; });
  const attempts = []; let feedback = '';
  for (let a = 0; a < 2; a++) {
    const p = carouselPrompt({ topic, angle: R.angle, style, facts, verdict: R.verdict, caveat: R.caveat, supports: R.supports, intensity, avoid, feedback });
    const r = await chat({ ...p, maxTokens: 1300, temperature: a ? 0.6 : 0.75 });
    if (!r.ok) { attempts.push({ ok: false, error: r.error, ms: r.ms }); continue; }
    const c = sanitizeCarousel(r.json); const issues = lintCarousel(c, facts); const high = issues.filter((i) => i.severity === 'high');
    attempts.push({ ok: true, carousel: c, issues, high: high.length, ms: r.ms, timings: r.timings, usage: r.usage });
    log(`  draft ${a + 1}: ${high.length} serious issue(s), ${issues.length - high.length} minor`);
    const needsRewrite = high.some((i) => /\.(body|headline)$/.test(i.where) || i.where === 'hooks');   // hook / stat problems are fixed by cutting
    if (!needsRewrite) break;
    feedback = high.map((i) => `- ${i.where}: ${i.detail}`).join('\n');
  }
  const good = attempts.filter((x) => x.ok); if (!good.length) return { ok: false, reason: 'writing failed: ' + (attempts[0]?.error || 'no draft'), attempts };
  const best = good.reduce((x, y) => (y.high < x.high ? y : x)); const fx = hardFix(best.carousel, best.issues, facts);
  return { ok: fx.fatal.length === 0, reason: fx.fatal.length ? 'unfixable: ' + fx.fatal.map((i) => `${i.where} (${i.detail})`).join('; ') : '', carousel: fx.carousel, issues: lintCarousel(fx.carousel, facts), fixes: fx.fixes, drafts: attempts.length,
    llm: { ms: attempts.reduce((n, x) => n + (x.ms || 0), 0), timings: best.timings, usage: best.usage } };
}

/** How much a reader can lean on this post, 0–100, with the reasons spelled out. */
export function credibility(R, W) {
  const flags = []; let score = 100; const used = new Set(R.facts.map((f) => f.source)); const levels = R.facts.map((f) => f.level);
  if (used.size === 1) { score -= 15; flags.push('Rests on a single source'); }
  if (!levels.includes('established')) { score -= 8; flags.push('No meta-analysis or systematic review among the sources'); }
  if (levels.every((l) => l === 'emerging')) { score -= 20; flags.push('Early evidence only'); }
  if (R.supports === 'partly') { score -= 6; flags.push('Evidence is mixed — the post says so'); }
  if (R.supports === 'no') flags.push('The evidence contradicts the popular claim — the post is written as a reality check');
  const old = R.sources.filter((s) => used.has(s.id) && s.outdated); if (old.length) { score -= 6; flags.push(`${old.length} source(s) older than 15 years`); }
  const warn = R.facts.filter((f) => f.causalWarning).length; if (warn) flags.push(`${warn} finding(s) show a link, not a cause — worded accordingly`);
  const minor = (W.issues || []).filter((i) => i.severity === 'medium').length; score -= Math.min(10, minor * 2);
  if ((W.fixes || []).length) flags.push(`Auto-corrected before publishing: ${W.fixes.join('; ')}`);
  return { score: Math.max(0, Math.min(100, score)), flags };
}

/** Full run for one topic → { ok, post | reason, trace }. */
export async function makePost(T) {
  const t0 = Date.now(); const llm = active(); log(`▶ ${T.topic}`);
  const R = await research(T); const trace = { topic: T.topic, research: { ok: R.ok, reason: R.reason, search: R.search, sources: R.sources.map((s) => ({ id: s.id, title: s.title, year: s.year, type: s.type, citedBy: s.citedBy, level: s.level, rel: s.rel, url: s.url })), facts: R.facts, rejected: R.rejected, supports: R.supports, angle: R.angle, verdict: R.verdict, caveat: R.caveat, llm: R.llm, raw: R.raw } };
  log(`  evidence: ${R.sources.length} sources, ${R.facts.length} grounded claim(s), ${R.rejected.length} rejected${R.ok ? '' : ' — ' + R.reason}`);
  if (!R.ok) return { ok: false, reason: R.reason, trace, ms: Date.now() - t0 };
  const style = R.supports === 'no' ? 'reality' : (STYLES[T.style] ? T.style : 'uncomfortable');
  const W = await write({ ...T, style }, R); trace.write = { ok: W.ok, reason: W.reason, drafts: W.drafts, fixes: W.fixes, issues: W.issues, llm: W.llm };
  if (!W.ok) { log(`  ✖ ${W.reason}`); return { ok: false, reason: W.reason, trace, carousel: W.carousel, ms: Date.now() - t0 }; }
  const c = W.carousel; const usedSrc = new Set(R.facts.map((f) => f.source)); const cred = credibility(R, W); const created = new Date().toISOString();
  const post = {
    id: `${created.slice(0, 10)}-${slug(c.title || T.topic, 48)}`, created, subject: T.subject || 'psychology', style, topic: T.topic, angle: R.angle, title: c.title || T.topic,
    hooks: c.hooks, hook: 0, slides: { reveal: c.reveal, explain: c.explain, matters: c.matters, example: c.example, question: c.question }, stat: c.stat?.value ? c.stat : null,
    claims: R.facts.map((f) => ({ id: f.id, text: f.claim, source: f.source, quote: f.quote, level: f.level, link: !f.causalOk })),
    sources: R.sources.filter((s) => usedSrc.has(s.id)).map((s) => ({ id: s.id, title: s.title, authors: s.authors, cite: s.cite || citeOf(s.authors), year: s.year, venue: s.venue, type: s.type, url: s.url, doi: s.doi, citedBy: s.citedBy, level: s.level })),
    also: R.sources.filter((s) => !usedSrc.has(s.id)).map((s) => ({ title: s.title, cite: s.cite, year: s.year, url: s.url, type: s.type })),
    verdict: R.verdict, caveat: R.caveat, supports: R.supports, caption: c.caption, hashtags: c.hashtags, imageIdeas: c.images, images: [],
    credibility: cred, intensity: T.intensity || 2, engine: { version: ENGINE_VERSION, writer: llm ? `${llm.name}:${llm.model}` : 'none', seconds: Math.round((Date.now() - t0) / 1000), drafts: W.drafts },
  };
  log(`  ✔ "${post.title}" — credibility ${cred.score}, ${post.engine.seconds}s`);
  return { ok: true, post, trace, ms: Date.now() - t0 };
}
