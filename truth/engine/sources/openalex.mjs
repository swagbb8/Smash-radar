// OpenAlex: 250M+ scholarly works across every field (economics, sociology, computer science, physics…).
// Free, no key. https://docs.openalex.org
import { getJSON, qs } from '../lib/http.mjs';
import { clean } from '../lib/text.mjs';
import { studyType } from './europepmc.mjs';

export function abstractFromIndex(inv) {
  if (!inv) return '';
  const out = []; for (const [word, positions] of Object.entries(inv)) for (const p of positions) out[p] = word;
  return clean(out.join(' '));
}

export async function search(query, { limit = 12, from = 1995, sort = 'relevance', reviewsOnly = false } = {}) {
  const filter = ['has_abstract:true', 'is_retracted:false', `from_publication_date:${from}-01-01`, 'language:en', reviewsOnly ? 'type:review' : 'type:article|review|preprint|book-chapter|report'].join(',');
  const url = 'https://api.openalex.org/works?' + qs({ search: query, filter, 'per-page': Math.min(limit, 50), sort: sort === 'cited' ? 'cited_by_count:desc' : sort === 'date' ? 'publication_date:desc' : undefined,
    select: 'id,doi,title,publication_year,publication_date,type,cited_by_count,is_retracted,primary_location,authorships,abstract_inverted_index,open_access', mailto: 'truth-engine@users.noreply.github.com' });
  const r = await getJSON(url);
  if (!r.ok) return { ok: false, error: r.error, total: 0, items: [] };
  const items = (r.data.results || []).map((w) => {
    const abstract = abstractFromIndex(w.abstract_inverted_index); const doi = w.doi ? String(w.doi).replace(/^https?:\/\/doi\.org\//, '').toLowerCase() : null; const au = (w.authorships || []).map((a) => a.author?.display_name).filter(Boolean);
    const type = w.type === 'preprint' ? 'preprint' : w.type === 'review' ? studyType(['review'], w.title || '', abstract) : studyType([], w.title || '', abstract);
    return {
      provider: 'openalex', key: doi ? 'doi:' + doi : 'openalex:' + String(w.id).split('/').pop(), kind: w.type === 'preprint' ? 'preprint' : w.type === 'report' ? 'report' : 'paper',
      title: clean(w.title || ''), authors: au.length > 3 ? `${au.slice(0, 3).join(', ')} et al.` : au.join(', '), year: w.publication_year || null, date: w.publication_date || null,
      venue: w.primary_location?.source?.display_name || '', doi, url: doi ? `https://doi.org/${doi}` : w.primary_location?.landing_page_url || w.id, abstract, pubTypes: [w.type], type,
      citedBy: w.cited_by_count || 0, openAccess: !!w.open_access?.is_oa, retracted: !!w.is_retracted,
    };
  }).filter((s) => s.title && s.abstract.length > 200);
  return { ok: true, total: r.data.meta?.count || 0, items };
}
