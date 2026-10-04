// OpenAlex: index of ~250M scholarly works across every field, with citation counts and retraction flags. Free, no key.
import { getJSON } from '../lib/util.mjs';

const SELECT = 'id,doi,display_name,publication_year,publication_date,type,cited_by_count,is_retracted,primary_location,open_access,abstract_inverted_index,authorships';

export async function searchOpenAlex(query, { limit = 12, minYear = 0, sort = 'relevance_score:desc', types = 'article|review|preprint' } = {}) {
  const filter = ['has_abstract:true', 'is_retracted:false', 'language:en', `type:${types}`]; if (minYear) filter.push(`publication_year:>${minYear - 1}`);
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&filter=${filter.join(',')}&sort=${sort}&per-page=${limit}&select=${SELECT}&mailto=truth-engine@users.noreply.github.com`;
  const j = await getJSON(url, { timeout: 30000 });
  return (j.results || []).map(toSource).filter((s) => s && s.text.length > 200);
}

export function abstractFromIndex(inv) {
  if (!inv) return '';
  const words = [];
  for (const [w, pos] of Object.entries(inv)) for (const p of pos) words[p] = w;
  return words.filter((w) => w != null).join(' ').replace(/\s+/g, ' ').trim();
}

function toSource(w) {
  if (!w.display_name) return null;
  const doi = w.doi ? String(w.doi).replace(/^https?:\/\/doi\.org\//i, '').toLowerCase() : null; const names = (w.authorships || []).map((a) => a.author?.display_name).filter(Boolean);
  const last = (n) => n.split(' ').slice(-1)[0];
  return {
    key: doi ? `doi:${doi}` : `openalex:${String(w.id).split('/').pop()}`, provider: 'openalex', title: String(w.display_name).replace(/\.$/, ''),
    authors: names.length === 0 ? '' : names.length <= 2 ? names.map(last).join(' & ') : `${last(names[0])} et al.`, year: w.publication_year || null, date: w.publication_date || null,
    venue: w.primary_location?.source?.display_name || (w.type === 'preprint' ? 'Preprint' : ''), doi, url: doi ? `https://doi.org/${doi}` : (w.primary_location?.landing_page_url || w.id),
    text: abstractFromIndex(w.abstract_inverted_index), pubTypes: [w.type].filter(Boolean), cited_by: w.cited_by_count || 0, open_access: !!w.open_access?.is_oa, retracted: !!w.is_retracted, preprint: w.type === 'preprint',
  };
}
