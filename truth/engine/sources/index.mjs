// Evidence desk: search every scholarly source for a question, merge duplicates, rank what is worth citing,
// and decide how much weight each source can carry.
import * as epmc from './europepmc.mjs';
import * as oalex from './openalex.mjs';
import { keywords, norm, sentences, clean, similarity } from '../lib/text.mjs';

const TYPE_RANK = { 'meta-analysis': 5, 'systematic-review': 4.6, rct: 4.2, experiment: 3.6, trial: 3.2, review: 3, observational: 2.4, study: 2.4, data: 4.5, preprint: 1, encyclopedia: 0.5 };
const YEAR = new Date().getFullYear();

/** established = many studies combined or official data · supported = solid peer-reviewed study · emerging = early. */
export function levelOf(s) {
  const text = `${s.title} ${s.abstract || ''}`.toLowerCase();
  if (s.type === 'preprint' || s.kind === 'preprint') return 'emerging';
  if (/\b(mice|mouse|rats?|rodents?|murine|zebrafish|drosophila|in vitro|pilot study|preliminary (study|evidence|findings)|case report|case series)\b/.test(text)) return 'emerging';
  const ns = [...text.matchAll(/\bn\s*=\s*(\d{1,6})\b/g)].map((m) => Number(m[1])); if (ns.length && Math.max(...ns) < 40) return 'emerging';
  if (['meta-analysis', 'systematic-review', 'data'].includes(s.type)) return 'established';
  if (s.type === 'encyclopedia') return 'background';
  return 'supported';
}
/** May this source carry cause-and-effect wording? */
export const isCausal = (s) => ['rct', 'trial', 'experiment'].includes(s.type) || (s.type === 'meta-analysis' && /random|experiment|intervention|trial/i.test(s.abstract || ''));

/** How well a source matches a query. Distinctive words count more than words every candidate shares ("cognitive"). */
export function relevance(s, query, idf = null) {
  const q = [...new Set(keywords(query))]; if (!q.length) return 0;
  const title = new Set(keywords(s.title)); const body = norm(`${s.title} ${s.abstract}`); let hit = 0, total = 0;
  for (const w of q) { const wt = idf?.get(w) ?? 1; total += wt; const stem = w.length > 5 ? w.slice(0, w.length - 1) : w; if (title.has(w) || [...title].some((t) => t.startsWith(stem))) hit += wt; else if (body.includes(stem)) hit += wt * 0.7; }
  return total ? Math.min(1, hit / total) : 0;
}
function idfOf(pool, queries) {
  const words = new Set(queries.flatMap((q) => keywords(q))); const n = Math.max(1, pool.length); const idf = new Map();
  for (const w of words) { const stem = w.length > 5 ? w.slice(0, w.length - 1) : w; const df = pool.filter((s) => norm(`${s.title} ${s.abstract}`).includes(stem)).length / n; idf.set(w, 0.35 + Math.log(1 + 1 / Math.max(df, 0.04))); }
  return idf;
}

/** "Ward AF, Duke K, …" or "Adrian F. Ward, Kristen Duke" → "Ward et al." */
export function citeOf(authors) {
  const list = clean(authors).replace(/ et al\.?$/i, '').split(/,\s*|;\s*| and /).map((a) => a.trim()).filter(Boolean); if (!list.length) return '';
  const surname = (a) => { const p = a.split(/\s+/); if (p.length > 1 && /^[A-Z]{1,3}$/.test(p[p.length - 1])) return p.slice(0, -1).join(' '); return p[p.length - 1]; };
  const many = list.length > 2 || / et al/i.test(authors);
  return many ? `${surname(list[0])} et al.` : list.map(surname).join(' & ');
}

/** Shorten a long abstract for the prompt without losing the results: keep the opening and the closing sentences. */
export function digest(abstract, max = 1100) {
  const a = clean(abstract); if (a.length <= max) return a;
  const ss = sentences(a); const head = []; const tail = []; let used = 0;
  for (const s of ss.slice(0, 2)) { if (used + s.length > max * 0.34) break; head.push(s); used += s.length + 1; }
  for (const s of ss.slice(head.length).reverse()) { if (used + s.length > max) break; tail.unshift(s); used += s.length + 1; }
  return head.length + tail.length >= ss.length ? a : `${head.join(' ')} … ${tail.join(' ')}`.trim();
}

/** queries: one or more phrasings of the question. → { sources: [{id:'S1', …, level, causal, rel, score}], stats } */
export async function gather(queries, { max = 6, from = 1995, perQuery = 14, oaLimit = 12 } = {}) {
  const jobs = [];
  for (const q of queries) { jobs.push(epmc.search(q, { limit: perQuery, from })); jobs.push(epmc.search(q, { limit: 8, from, sort: 'cited' })); jobs.push(epmc.search(q, { limit: 6, from, reviewsOnly: true })); jobs.push(oalex.search(q, { limit: oaLimit, from })); jobs.push(oalex.search(q, { limit: 6, from, reviewsOnly: true })); }
  const res = await Promise.all(jobs); const errors = res.filter((r) => !r.ok).map((r) => r.error); const pool = new Map();
  for (const s of res.flatMap((r) => r.items)) {
    if (s.retracted) continue; const key = s.doi ? 'doi:' + s.doi : 't:' + norm(s.title).slice(0, 90); const prev = pool.get(key);
    if (!prev) pool.set(key, s); else pool.set(key, { ...(s.abstract.length > prev.abstract.length ? s : prev), citedBy: Math.max(s.citedBy, prev.citedBy), type: (TYPE_RANK[s.type] || 0) > (TYPE_RANK[prev.type] || 0) ? s.type : prev.type, authors: prev.provider === 'europepmc' ? prev.authors : s.authors });
  }
  // the same work often appears twice (preprint + journal version): keep the published, better-described one
  const list = [...pool.values()]; const drop = new Set();
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    if (drop.has(i) || drop.has(j) || similarity(list[i].title, list[j].title) < 0.8) continue;
    const worse = (list[i].type === 'preprint') !== (list[j].type === 'preprint') ? (list[i].type === 'preprint' ? i : j) : (list[i].citedBy >= list[j].citedBy ? j : i); drop.add(worse);
  }
  const kept = list.filter((_, i) => !drop.has(i)); const idf = idfOf(kept, queries);
  const all = kept.map((s) => {
    const rel = Math.max(...queries.map((q) => relevance(s, q, idf))); const age = s.year ? YEAR - s.year : 30;
    const score = rel * 4 + (TYPE_RANK[s.type] || 2) * 0.6 + Math.min(3, Math.log10(1 + s.citedBy)) * 0.7 - (age > 15 ? 0.6 : 0) - (s.citedBy === 0 && age >= 2 ? 0.5 : 0);
    return { ...s, rel: +rel.toFixed(2), score: +score.toFixed(2), level: levelOf(s), causal: isCausal(s), cite: citeOf(s.authors), outdated: age > 15 && !['meta-analysis', 'systematic-review'].includes(s.type) };
  }).filter((s) => s.rel >= 0.55).sort((a, b) => b.score - a.score);
  // keep only sources in the same league as the best one (off-topic fillers fall away); always seat the strongest synthesis (meta-analysis / review) if there is one
  const top = all[0]?.score || 0; const close = all.filter((s) => s.score >= top - 3.2); const pick = close.slice(0, max);
  const synth = close.find((s) => ['meta-analysis', 'systematic-review'].includes(s.type)); if (synth && !pick.includes(synth)) pick[pick.length - 1] = synth;
  pick.sort((a, b) => b.score - a.score);
  return { sources: pick.map((s, i) => ({ ...s, id: 'S' + (i + 1) })), stats: { found: pool.size, relevant: all.length, errors } };
}
