// Europe PMC: 40M+ life-science, psychology and health papers with abstracts, publication types and citation counts. Free, no key.
import { getJSON, stripTags } from '../lib/util.mjs';

const BASE = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';

export async function searchEuropePMC(query, { limit = 12, sort = '', minYear = 0, reviewsOnly = false } = {}) {
  let q = `(${query}) AND HAS_ABSTRACT:y AND LANG:eng`;
  if (minYear) q += ` AND PUB_YEAR:[${minYear} TO 2100]`;
  if (reviewsOnly) q += ' AND (PUB_TYPE:"meta-analysis" OR PUB_TYPE:"systematic review" OR PUB_TYPE:"review")';
  const url = `${BASE}?query=${encodeURIComponent(q)}&format=json&pageSize=${limit}&resultType=core${sort ? `&sort=${encodeURIComponent(sort)}` : ''}`;
  const j = await getJSON(url, { timeout: 30000 });
  return (j.resultList?.result || []).map(toSource).filter((s) => s && s.text.length > 200);
}

function toSource(r) {
  if (!r.title) return null;
  const types = (r.pubTypeList?.pubType || []).map((t) => String(t).toLowerCase());
  const doi = r.doi ? String(r.doi).toLowerCase() : null;
  return {
    key: doi ? `doi:${doi}` : r.pmid ? `pmid:${r.pmid}` : `epmc:${r.source}:${r.id}`,
    provider: 'europepmc', title: stripTags(r.title).replace(/\.$/, ''), authors: shortAuthors(r.authorString), year: Number(r.pubYear) || null, date: r.firstPublicationDate || null,
    venue: r.journalInfo?.journal?.title || r.journalTitle || r.bookOrReportDetails?.publisher || (r.source === 'PPR' ? 'Preprint' : ''),
    doi, pmid: r.pmid || null, url: doi ? `https://doi.org/${doi}` : r.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/` : `https://europepmc.org/article/${r.source}/${r.id}`,
    text: stripTags(r.abstractText || ''), pubTypes: types, cited_by: Number(r.citedByCount) || 0, open_access: r.isOpenAccess === 'Y',
    retracted: types.some((t) => t.includes('retracted publication') || t.includes('retraction of publication')), preprint: r.source === 'PPR' || types.includes('preprint'),
  };
}

export function shortAuthors(s) {
  if (!s) return '';
  const a = String(s).replace(/\.$/, '').split(/,\s*/).filter(Boolean);
  return a.length <= 2 ? a.join(' & ') : `${a[0]} et al.`;
}
