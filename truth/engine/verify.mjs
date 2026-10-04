// Programmatic fact checks. Nothing here trusts the model: quotes must exist in the source, numbers must come from the quote.
import { norm } from './lib/util.mjs';

/** Is `quote` really in `text`? Exact after normalisation, else the best sliding-window word overlap. -> { found, score } */
export function findQuote(quote, text) {
  const q = norm(quote), t = norm(text);
  if (!q || q.split(' ').length < 5) return { found: false, score: 0, why: 'quote too short' };
  if (t.includes(q)) return { found: true, score: 1 };
  const qw = q.split(' '), tw = t.split(' '); const n = qw.length; let best = 0;
  const qset = new Map(); for (const w of qw) qset.set(w, (qset.get(w) || 0) + 1);
  for (let i = 0; i + Math.max(4, n - 4) <= tw.length; i++) {
    const win = tw.slice(i, i + n + 3); const need = new Map(qset); let hit = 0;
    for (const w of win) { const c = need.get(w); if (c) { hit++; need.set(w, c - 1); } }
    const s = hit / n; if (s > best) best = s;
    if (best >= 0.999) break;
  }
  return { found: best >= 0.88, score: +best.toFixed(3), why: best >= 0.88 ? undefined : 'quote not found in source text' };
}

const WORDNUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, half: 0.5, twice: 2, double: 2, triple: 3 };
/** Every number mentioned in a text, as canonical strings ("23", "0.5", "23%" -> "23"). Years in parentheses are kept: they must match too. */
export function numbersIn(text) {
  const out = new Set(); const s = String(text || '').replace(/(\d),(\d{3})/g, '$1$2');
  for (const m of s.matchAll(/\d+(?:\.\d+)?/g)) out.add(String(Number(m[0])));
  for (const w of norm(s).split(' ')) if (w in WORDNUM) out.add('w:' + WORDNUM[w]);
  return out;
}

/** Numbers used in `claim` that do not appear in `support` (word-numbers may be backed by digits). */
export function unsupportedNumbers(claim, support) {
  const have = numbersIn(support); const plain = new Set([...have].map((x) => x.replace(/^w:/, '')));
  return [...numbersIn(claim)].filter((n) => !plain.has(n.replace(/^w:/, '')) && !['w:1', '1'].includes(n)).map((n) => n.replace(/^w:/, ''));
}

const CAUSAL = /\b(causes?|caused|causing|makes? (you|your|us|people|them|it)|leads? to|led to|results? in|triggers?|destroys?|rewires?|shrinks?|damages?|kills?|ruins?|because of|due to|drives?|produces?|forces?)\b/i;
export const soundsCausal = (s) => CAUSAL.test(String(s || ''));

/** Validate one extracted claim against its source. -> { ok, issues[], quote: {found, score} } */
export function checkClaim(claim, source) {
  const issues = [];
  if (!source) return { ok: false, issues: ['cites a source that was not provided'] };
  const q = findQuote(claim.quote, source.text); if (!q.found) issues.push(q.why || 'quote not found');
  const bad = unsupportedNumbers(claim.text, claim.quote); if (bad.length) issues.push(`number(s) not in quote: ${bad.join(', ')}`);
  const causalOverreach = soundsCausal(claim.text) && !source.grade?.causal && !soundsCausal(claim.quote);
  if (causalOverreach) issues.push('cause-and-effect wording on a non-experimental source');
  return { ok: issues.length === 0, issues, quote: q, causalOverreach };
}
