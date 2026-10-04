// Grounding checks — the engine's lie detector. Nothing a model writes is trusted until it passes these.
//   findQuote     is the quoted evidence really in the source text?
//   numbersIn     every figure in a sentence
//   checkClaim    quote present + every number in the claim present in the source + causal-language lint
import { norm, words } from './lib/text.mjs';

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
