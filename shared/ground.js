// Grounding checks — the engine's lie detector. Nothing a model writes is trusted until it passes these.
//   findQuote     is the quoted evidence really in the source text?
//   numbersIn     every figure in a sentence
//   checkClaim    quote present + every number in the claim present in the source + causal-language lint
import { norm, words } from './text.js';

/** Is `quote` (possibly with … elisions) present in `text`? Exact after normalisation, else best fuzzy window. */
export function findQuote(quote, text) {
  const T = norm(text); const parts = String(quote || '').split(/\s*(?:\.\.\.|…|\[\.\.\.\])\s*/).map(norm).filter((p) => p.length > 0);
  if (!parts.length || !T) return { found: false, score: 0, exact: false };
  let pos = 0, exact = true; const scores = [];
  for (const p of parts) {
    const i = T.indexOf(p, pos);
    if (i >= 0) { pos = i + p.length; scores.push(1); continue; }
    exact = false; scores.push(fuzzy(p, T));
  }
  const score = Math.min(...scores);
  return { found: score >= 0.86, score: +score.toFixed(3), exact };
}

/** Best share of the quote's words that appear, in order, inside one window of the text (0..1). */
function fuzzy(q, T) {
  const qw = words(q), tw = words(T); if (qw.length < 3 || !tw.length) return 0;
  const first = new Map(); tw.forEach((w, i) => { if (!first.has(w)) first.set(w, []); first.get(w).push(i); });
  let best = 0; const starts = new Set();
  for (const w of qw.slice(0, 4)) for (const i of first.get(w) || []) starts.add(Math.max(0, i - 3));
  for (const s of starts) {
    const win = tw.slice(s, s + Math.ceil(qw.length * 1.4) + 6); let j = 0, hit = 0;
    for (const w of qw) { const k = win.indexOf(w, j); if (k >= 0) { hit++; j = k + 1; } }
    best = Math.max(best, hit / qw.length); if (best === 1) break;
  }
  return best;
}

const WORD_NUM = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000, million: 1e6, billion: 1e9 };
const FRACTIONS = [[/\b(?:one|a)[ -]half\b|\bhalf\b/g, 50], [/\b(?:one|a)[ -]third\b/g, 33.3], [/\btwo[ -]thirds\b/g, 66.7], [/\b(?:one|a)[ -]quarter\b/g, 25], [/\bthree[ -]quarters\b/g, 75], [/\b(?:one|a)[ -]fifth\b/g, 20], [/\b(?:one|a)[ -]tenth\b/g, 10], [/\btwice\b|\bdoubl(?:e|ed|es|ing)\b/g, 2], [/\btripl(?:e|ed|es|ing)\b/g, 3]];

/** All numeric values in a sentence as canonical numbers (handles 1,200 · 3.5 · 40% · 2 million · "twelve"). */
export function numbersIn(s) {
  const text = String(s || '').toLowerCase().replace(/(\d),(?=\d{3}\b)/g, '$1'); const out = [];
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*(%|percent|per cent|million|billion|thousand|k\b|m\b|bn\b)?/g)) {
    let v = parseFloat(m[1]); const u = m[2] || '';
    if (/million|^m$/.test(u)) v *= 1e6; else if (/billion|bn/.test(u)) v *= 1e9; else if (/thousand|^k$/.test(u)) v *= 1e3;
    out.push({ v, pct: /%|percent|per cent/.test(u), raw: m[0].trim() });
  }
  for (const [w, v] of Object.entries(WORD_NUM)) if (v >= 2 && v <= 12 && new RegExp(`\\b${w}\\b`).test(text)) out.push({ v, pct: false, raw: w, word: true });
  return out;
}

/** Numbers in `sentence` that cannot be found in `evidence` (same value; percent ↔ fraction words allowed). */
export function unsupportedNumbers(sentence, evidence, { ignoreYears = [] } = {}) {
  const have = numbersIn(evidence); const haveVals = have.map((n) => n.v); const ev = String(evidence || '').toLowerCase(); const fr = [];
  for (const [re, v] of FRACTIONS) if (re.test(ev)) fr.push(v);
  const near = (a, b) => Math.abs(a - b) <= Math.max(0.051, Math.abs(b) * 0.006);
  return numbersIn(sentence).filter((n) => {
    if (n.word && n.v <= 3) return false;                                   // "one", "two", "three" used as ordinary words
    if (!n.pct && Number.isInteger(n.v) && n.v >= 1900 && n.v <= 2100 && (ignoreYears.includes(n.v) || haveVals.some((h) => near(h, n.v)))) return false;
    if (haveVals.some((h) => near(h, n.v))) return false;
    if (fr.some((h) => near(h, n.v))) return false;
    if (n.pct && haveVals.some((h) => near(h * 100, n.v))) return false;     // 0.4 ↔ 40%
    return true;
  }).map((n) => n.raw);
}

const CAUSAL = /\b(causes?|caused|causing|leads? to|led to|results? in|makes? you|make people|triggers?|destroys?|damages?|rewires?|shrinks?|kills?|because of|due to|proves?|proven to)\b/i;
const CORREL = /\b(associat|correlat|linked|relationship between|cross-sectional|cohort|longitudinal|survey|observational|self-report|predict(?:s|ed|or)?)\b/i;
const EXPERIMENTAL = new Set(['rct', 'trial', 'experiment', 'meta-analysis']);

/** Flag causal wording when the cited study can only show a correlation. */
export function causalLint(sentence, source) {
  if (!CAUSAL.test(sentence)) return null;
  const txt = `${source?.title || ''} ${source?.abstract || ''}`;
  if (EXPERIMENTAL.has(source?.type) && /random|experiment|assigned|manipulat|intervention|trial/i.test(txt)) return null;
  if (CORREL.test(txt) || !EXPERIMENTAL.has(source?.type)) return 'causal wording, but the cited study only shows an association';
  return null;
}

export function checkClaim(claim, source) {
  if (!source) return { ok: false, quoteFound: false, numbers: [], causal: null, reason: 'source not in the retrieved set' };
  const text = `${source.title}. ${source.abstract || source.text || ''}`; const q = findQuote(claim.quote, text);
  const missing = unsupportedNumbers(claim.claim || claim.text || '', text, { ignoreYears: [source.year] });
  const causal = causalLint(claim.claim || claim.text || '', source);
  return { ok: q.found && missing.length === 0, quoteFound: q.found, quoteScore: q.score, quoteExact: q.exact, numbers: missing, causal, reason: !q.found ? 'quote not found in the source' : missing.length ? `numbers not in the source: ${missing.join(', ')}` : '' };
}

// ------------------------------------------------------------------------------------------------ carousel checks
const TAG = /\s*[\[(]\s*F\d+(?:\s*,\s*F\d+)*\s*[\])]/g;
const BANNED = /\b(shocking|mind-?blowing|insane|crazy|you won'?t believe|game-?changer|sheeple|wake up|did you know)\b/i;
const CLOCK = /\b\d{1,2}(?::\d{2})?\s?(?:a\.?m\.?|p\.?m\.?|o'clock)\b|\b\d{1,2}:\d{2}\b/gi;
const wordCount = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;
export const soundsCausal = (s) => CAUSAL.test(String(s || ''));

function tidy(s, { headline = false } = {}) {
  let t = String(s ?? '').replace(TAG, '').replace(/\bF\d+:\s*/g, '').replace(/\*\*|__|`/g, '').replace(/\s+\[\s*$/, '').replace(/\s+/g, ' ').replace(/\s+([.,;:?])/g, '$1').trim();
  if (headline) t = t.replace(/\s*:\s*$/, '').replace(/^["“”']+|["“”']+$/g, '');
  return t;
}

/** Clean up what a model wrote without changing its meaning: fact tags out of the prose, markdown out, hashtags normalised. */
export function sanitizeCarousel(c) {
  const out = JSON.parse(JSON.stringify(c || {}));
  for (const k of ['reveal', 'explain', 'matters', 'example', 'question']) if (out[k]) { out[k].headline = tidy(out[k].headline, { headline: true }); out[k].body = tidy(out[k].body); if (out[k].facts) out[k].facts = [...new Set(out[k].facts)]; }
  if (out.stat) { out.stat.value = tidy(out.stat.value, { headline: true }); out.stat.label = tidy(out.stat.label, { headline: true }).replace(/\.$/, ''); }
  out.hooks = (out.hooks || []).map((h) => ({ type: h.type, text: tidy(h.text, { headline: true }) })).filter((h) => h.text);
  out.caption = String(out.caption ?? '').replace(TAG, '').replace(/\*\*|__/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  out.hashtags = [...new Set((out.hashtags || []).map((h) => String(h).toLowerCase().replace(/[^a-z0-9]/g, '')).filter((h) => h.length > 2 && h.length < 30))];
  out.images = (out.images || []).map((i) => tidy(i).replace(/\.$/, '')).filter(Boolean); out.title = tidy(out.title, { headline: true });
  return out;
}

/** Everything wrong with a written carousel, judged against the verified facts. → [{ where, kind, severity, detail }] */
export function lintCarousel(c, facts) {
  const issues = []; const add = (where, kind, severity, detail) => issues.push({ where, kind, severity, detail });
  const byId = Object.fromEntries(facts.map((f) => [f.id, f])); const evidence = facts.map((f) => `${f.claim} ${f.quote}`).join(' ');
  const fields = [];
  for (const k of ['reveal', 'explain', 'matters', 'example', 'question']) { fields.push([`${k}.headline`, c[k]?.headline, k]); fields.push([`${k}.body`, c[k]?.body, k]); }
  fields.push(['stat.label', c.stat?.label, 'stat'], ['caption', c.caption, 'caption']); (c.hooks || []).forEach((h, i) => fields.push([`hooks.${i}`, h.text, 'hook']));
  for (const [where, text, slide] of fields) {
    if (!text) { if (/reveal\.headline|explain\.headline|explain\.body|matters\.body|example\.body|question\.headline/.test(where)) add(where, 'empty', 'high', 'missing text'); continue; }
    const probe = slide === 'example' || slide === 'question' ? text.replace(CLOCK, ' ') : text;
    const bad = unsupportedNumbers(probe, evidence); if (bad.length) add(where, 'number', slide === 'example' || slide === 'question' ? 'medium' : 'high', `not in the verified facts: ${bad.join(', ')}`);
    if (/\bF\d+\b/.test(text)) add(where, 'tag', 'high', 'fact tag left in the text');
    if (/\bthink X\b|\bsays Y\b|\bX\b.{0,30}\bY\b/.test(text)) add(where, 'template', 'high', 'placeholder text');
    if (BANNED.test(text)) add(where, 'banned', 'medium', 'hype wording'); if (/!/.test(text)) add(where, 'banned', 'medium', 'exclamation mark');
    if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text)) add(where, 'banned', 'medium', 'emoji');
    if (slide !== 'caption' && (text.match(/\b[A-Z]{4,}\b/g) || []).length > 1) add(where, 'style', 'medium', 'capital letters');
    const w = wordCount(text);
    if (/headline$/.test(where) || slide === 'hook') { if (w > 16) add(where, 'length', 'medium', `${w} words`); }
    else if (slide !== 'caption' && slide !== 'stat' && w > 52) add(where, 'length', 'medium', `${w} words`);
  }
  for (const k of ['reveal', 'explain']) {
    const used = (c[k]?.facts || []).map((id) => byId[id]).filter(Boolean); const text = `${c[k]?.headline || ''} ${c[k]?.body || ''}`;
    if (!used.length) add(`${k}.facts`, 'unsourced', 'medium', 'no fact referenced');
    if (soundsCausal(text) && used.length && !used.some((f) => f.causalOk || soundsCausal(f.claim))) add(`${k}.body`, 'causal', 'high', 'cause-and-effect wording, but the evidence only shows a link');
  }
  if (c.stat?.value) {
    const f = byId[c.stat.fact]; const bad = unsupportedNumbers(c.stat.value, f ? `${f.claim} ${f.quote}` : evidence);
    if (bad.length) add('stat.value', 'number', 'high', `not in its fact: ${bad.join(', ')}`);
    if (wordCount(c.stat.value) > 4) add('stat.value', 'length', 'medium', 'too long to show large');
  }
  if ((c.hooks || []).length < 1) add('hooks', 'empty', 'high', 'no usable hook'); else if (c.hooks.length < 3) add('hooks', 'empty', 'medium', 'fewer than 3 hooks');
  return issues;
}

/** Remove what cannot be published: bad hooks, an unsupported stat, sentences carrying invented numbers. */
export function hardFix(c, issues, facts) {
  const out = JSON.parse(JSON.stringify(c)); const fixes = []; const evidence = facts.map((f) => `${f.claim} ${f.quote}`).join(' ');
  const badHooks = new Set(issues.filter((i) => i.where.startsWith('hooks.') && i.severity === 'high').map((i) => Number(i.where.split('.')[1])));
  if (badHooks.size) { out.hooks = out.hooks.filter((_, i) => !badHooks.has(i)); fixes.push(`dropped ${badHooks.size} hook(s)`); }
  if (issues.some((i) => i.where === 'stat.value' && i.severity === 'high')) { out.stat = { value: '', label: '', fact: '' }; fixes.push('removed the stat'); }
  for (const i of issues.filter((x) => x.kind === 'number' && /\.(body|headline)$/.test(x.where) && x.severity === 'high')) {
    const [slide, part] = i.where.split('.'); const text = out[slide]?.[part]; if (!text) continue;
    const kept = (text.match(/[^.!?]+[.!?]*/g) || [text]).filter((s) => unsupportedNumbers(s, evidence).length === 0).join(' ').replace(/\s+/g, ' ').trim();
    out[slide][part] = kept; fixes.push(`cut a sentence with an unverified number from ${i.where}`);
  }
  if (issues.some((i) => i.where === 'caption' && i.kind === 'number' && i.severity === 'high')) {
    out.caption = out.caption.split(/\n+/).map((p) => (p.match(/[^.!?]+[.!?]*/g) || [p]).filter((s) => unsupportedNumbers(s, evidence).length === 0).join(' ').trim()).filter(Boolean).join('\n\n'); fixes.push('cut unverified numbers from the caption');
  }
  if (!out.hooks.length && out.reveal?.headline) { out.hooks = [{ text: out.reveal.headline, type: 'statement' }]; fixes.push('used the reveal headline as the hook'); }
  const left = lintCarousel(out, facts).filter((i) => i.severity === 'high');
  return { carousel: out, fixes, fatal: left.filter((i) => i.kind !== 'unsourced'), remaining: left };
}
