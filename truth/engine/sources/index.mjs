// Search every evidence source, merge duplicates, grade the study design, and rank what is worth citing.
import { searchEuropePMC } from './europepmc.mjs';
import { searchOpenAlex } from './openalex.mjs';
import { wikiSearch, wikiSummary } from './wikipedia.mjs';
import { norm, log } from '../lib/util.mjs';

const YEAR = new Date().getFullYear();

/** What kind of evidence is this? -> design, plus how much weight it can carry. */
export function grade(s) {
  const t = `${s.title} ${(s.pubTypes || []).join(' ')}`.toLowerCase(); const a = (s.text || '').toLowerCase();
  let design = 'study';
  if (s.provider === 'wikipedia') design = 'encyclopedia';
  else if (/meta-?analy/.test(t) || /\bmeta-?analy(sis|ses|tic)\b/.test(a.slice(0, 600))) design = 'meta-analysis';
  else if (/systematic review/.test(t) || /systematic(ally)? review/.test(a.slice(0, 500))) design = 'systematic review';
  else if (/randomi[sz]ed controlled trial|\brct\b/.test(t) || /randomi[sz]ed (controlled |clinical )?trial|randomly assigned|were randomi[sz]ed/.test(a)) design = 'randomized trial';
  else if (/\breview\b/.test(t)) design = 'review';
  else if (/\bexperiment(s|al)?\b/.test(a) && /participants|subjects/.test(a)) design = 'experiment';
  else if (/longitudinal|cohort|prospective|followed (up )?for/.test(a)) design = 'longitudinal study';
  else if (/cross-sectional|survey|questionnaire|self-report/.test(a)) design = 'survey study';
  if (s.preprint) design = 'preprint';
  const causal = ['meta-analysis', 'randomized trial', 'experiment'].includes(design);                 // may support cause-and-effect wording
  const base = { 'meta-analysis': 0.95, 'systematic review': 0.9, 'randomized trial': 0.85, review: 0.7, experiment: 0.7, 'longitudinal study': 0.65, 'survey study': 0.5, study: 0.55, preprint: 0.35, encyclopedia: 0.3 }[design];
  const cites = Math.min(1, Math.log10(1 + (s.cited_by || 0)) / 3); const age = s.year ? YEAR - s.year : 99;
  const strength = Math.max(0.05, Math.min(1, base * 0.7 + cites * 0.3 - (s.retracted ? 1 : 0)));
  const level = s.retracted ? 'retracted' : design === 'encyclopedia' ? 'background' : strength >= 0.72 ? 'strong' : strength >= 0.5 ? 'moderate' : 'early';
  return { design, causal, strength: +strength.toFixed(2), level, age, outdated: age > 15 && !['meta-analysis', 'systematic review'].includes(design) };
}

export function relevance(s, query) {
  const q = norm(query).split(' ').filter((w) => w.length > 3); if (!q.length) return 0;
  const hay = norm(`${s.title} ${s.title} ${s.text}`); return q.filter((w) => hay.includes(w)).length / q.length;
}

/** queries: several phrasings of the same question. Returns graded, de-duplicated sources, best first. */
export async function findEvidence(queries, { perQuery = 8, minYear = 2000, max = 10, wiki = true } = {}) {
  const jobs = [];
  for (const q of queries) {
    jobs.push(searchEuropePMC(q, { limit: perQuery, minYear }).catch((e) => (log('europepmc failed', e.message), [])));
    jobs.push(searchEuropePMC(q, { limit: 5, minYear, reviewsOnly: true }).catch(() => []));
    jobs.push(searchOpenAlex(q, { limit: perQuery, minYear }).catch((e) => (log('openalex failed', e.message), [])));
  }
  const found = (await Promise.all(jobs)).flat(); const byKey = new Map();
  for (const s of found) {
    const dupKey = s.doi ? `doi:${s.doi}` : norm(s.title).slice(0, 80); const prev = byKey.get(dupKey);
    if (!prev || (s.text.length > prev.text.length)) byKey.set(dupKey, prev ? { ...s, cited_by: Math.max(s.cited_by, prev.cited_by), pubTypes: [...new Set([...(prev.pubTypes || []), ...(s.pubTypes || [])])] } : s);
  }
  const all = [...byKey.values()].filter((s) => !s.retracted).map((s) => ({ ...s, grade: grade(s), rel: Math.max(...queries.map((q) => relevance(s, q))) }));
  all.sort((a, b) => (b.rel * 0.55 + b.grade.strength * 0.45) - (a.rel * 0.55 + a.grade.strength * 0.45));
  const top = all.filter((s) => s.rel >= 0.5).slice(0, max);
  if (wiki) {
    try { const titles = await wikiSearch(queries[0], 1); if (titles[0]) { const w = await wikiSummary(titles[0]); if (w) top.push({ ...w, grade: grade(w), rel: relevance(w, queries[0]) }); } } catch (e) { log('wikipedia failed', e.message); }
  }
  return top.map((s, i) => ({ ...s, id: `S${i + 1}` }));
}
