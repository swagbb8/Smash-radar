// Crossref: the registry behind DOIs — every field, including the ones Europe PMC is thin on (economics, sociology,
// history, physics). Only a share of records carry an abstract, so only those are asked for. Free, no key.
// https://api.crossref.org
import { getJSON, qs } from '../lib/http.mjs';
import { clean } from '../lib/text.mjs';
import { studyType } from './europepmc.mjs';

const englishish = (s) => / the /.test(s) && / (of|and|in) /.test(s);

export async function search(query, { limit = 10, from = 1995, reviewsOnly = false } = {}) {
  const filter = ['has-abstract:true', `from-pub-date:${from}-01-01`, 'type:journal-article', 'type:posted-content', 'type:book-chapter', 'type:report'].join(',');
  const url = 'https://api.crossref.org/works?' + qs({ 'query.bibliographic': reviewsOnly ? `${query} meta-analysis review` : query, filter, rows: Math.min(limit, 30), select: 'DOI,title,abstract,author,container-title,issued,type,is-referenced-by-count', mailto: 'truth-engine@users.noreply.github.com' });
  const r = await getJSON(url);
  if (!r.ok) return { ok: false, error: `crossref ${r.status}: ${r.error}`, total: 0, items: [] };
  const items = (r.data?.message?.items || []).map((w) => {
    const title = clean((w.title || [])[0] || ''); const abstract = clean(String(w.abstract || '')).replace(/^(abstract|summary)[:.\s]+/i, ''); const doi = w.DOI ? String(w.DOI).toLowerCase() : null;
    const au = (w.author || []).map((a) => [a.given, a.family].filter(Boolean).join(' ') || a.name).filter(Boolean); const year = w.issued?.['date-parts']?.[0]?.[0] || null; const pre = w.type === 'posted-content';
    return {
      provider: 'crossref', key: 'doi:' + doi, kind: pre ? 'preprint' : w.type === 'report' ? 'report' : 'paper', title, authors: au.length > 3 ? `${au.slice(0, 3).join(', ')} et al.` : au.join(', '), year, date: w.issued?.['date-parts']?.[0]?.join('-') || null,
      venue: clean((w['container-title'] || [])[0] || ''), doi, url: doi ? `https://doi.org/${doi}` : '', abstract, pubTypes: [w.type], type: pre ? 'preprint' : studyType([], title, abstract),
      citedBy: w['is-referenced-by-count'] || 0, openAccess: false, retracted: /^\s*(retracted|retraction)\b/i.test(title),
    };
  }).filter((s) => s.doi && s.title && s.abstract.length > 200 && englishish(s.abstract));
  return { ok: true, total: r.data?.message?.['total-results'] || 0, items };
}
