// Europe PMC: 40M+ life-science, psychology and health papers with abstracts, publication types and citation counts.
// Free, no key. https://europepmc.org/RestfulWebService
import { getJSON, qs } from '../lib/http.mjs';
import { clean } from '../lib/text.mjs';

const TYPE_RANK = [['meta-analysis', 'meta-analysis'], ['systematic review', 'systematic-review'], ['randomized controlled trial', 'rct'], ['clinical trial', 'trial'], ['review', 'review'], ['observational study', 'observational'], ['preprint', 'preprint']];

export function studyType(pubTypes = [], title = '', abstract = '') {
  const t = pubTypes.map((x) => String(x).toLowerCase()); const text = (title + ' ' + abstract.slice(0, 600)).toLowerCase();
  for (const [needle, label] of TYPE_RANK.slice(0, 3)) if (t.some((x) => x.includes(needle))) return label;      // explicit strong designs first
  if (/\bmeta-?analy/.test(text)) return 'meta-analysis';
  if (/systematic review/.test(text)) return 'systematic-review';
  for (const [needle, label] of TYPE_RANK.slice(3)) if (t.some((x) => x.includes(needle))) return label;
  if (/randomi[sz]ed/.test(text) && /trial|controlled|assigned/.test(text)) return 'rct';
  const all = (title + ' ' + abstract).toLowerCase();
  if (/\b(experiments?|experimental (study|design|condition)|participants were (randomly )?assigned|randomly assigned|manipulat)/.test(all) && !/\b(cross-sectional|cohort study|survey data)\b/.test(text)) return 'experiment';
  if (/\b(cross-sectional|cohort|longitudinal|survey|observational|case-control|self-report)\b/.test(all)) return 'observational';
  if (/\breview\b/.test(title.toLowerCase())) return 'review';
  return 'study';
}

/** Search → normalized source records. `query` uses Europe PMC syntax; plain words work too. */
export async function search(query, { limit = 12, sort = 'relevance', from = 1995, reviewsOnly = false } = {}) {
  let q = `(${query}) AND HAS_ABSTRACT:y AND LANG:eng AND PUB_YEAR:[${from} TO 2100] NOT PUB_TYPE:"retraction of publication" NOT PUB_TYPE:"retracted publication"`;
  if (reviewsOnly) q += ' AND (PUB_TYPE:"meta-analysis" OR PUB_TYPE:"systematic review" OR PUB_TYPE:"review")';
  const url = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search?' + qs({ query: q, format: 'json', pageSize: Math.min(limit, 50), resultType: 'core', sort: sort === 'cited' ? 'CITED desc' : sort === 'date' ? 'P_PDATE_D desc' : undefined });
  const r = await getJSON(url);
  if (!r.ok) return { ok: false, error: r.error, total: 0, items: [] };
  const items = (r.data.resultList?.result || []).map((w) => {
    const abstract = clean(w.abstractText || ''); const pubTypes = w.pubTypeList?.pubType || []; const doi = w.doi ? String(w.doi).toLowerCase() : null;
    return {
      provider: 'europepmc', key: doi ? 'doi:' + doi : `epmc:${w.source}:${w.id}`, kind: w.source === 'PPR' ? 'preprint' : 'paper',
      title: clean(w.title || '').replace(/\.$/, ''), authors: clean(w.authorString || '').replace(/\.$/, ''), year: Number(w.pubYear) || null, date: w.firstPublicationDate || null,
      venue: w.journalInfo?.journal?.title || w.bookOrReportDetails?.publisher || (w.source === 'PPR' ? 'Preprint' : ''), doi,
      url: doi ? `https://doi.org/${doi}` : w.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${w.pmid}/` : `https://europepmc.org/article/${w.source}/${w.id}`,
      pmid: w.pmid || null, abstract, pubTypes, type: w.source === 'PPR' ? 'preprint' : studyType(pubTypes, w.title, abstract), citedBy: Number(w.citedByCount) || 0, openAccess: w.isOpenAccess === 'Y', retracted: pubTypes.some((t) => /retract/i.test(t)),
    };
  }).filter((s) => s.title && s.abstract.length > 200);
  return { ok: true, total: r.data.hitCount || 0, items };
}
