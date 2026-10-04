// Wikipedia: background context only — an encyclopedia is never the evidence for a headline claim. Free, no key.
import { getJSON, qs } from '../lib/http.mjs';
import { clean } from '../lib/text.mjs';

export async function titles(query, limit = 3) {
  const r = await getJSON('https://en.wikipedia.org/w/api.php?' + qs({ action: 'query', list: 'search', srsearch: query, format: 'json', srlimit: limit, origin: '*' }));
  return r.ok ? (r.data.query?.search || []).map((s) => s.title) : [];
}

export async function summary(title) {
  const r = await getJSON('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(String(title).replace(/ /g, '_')));
  if (!r.ok || r.data.type === 'disambiguation' || !r.data.extract) return null; const j = r.data;
  return { provider: 'wikipedia', key: 'wiki:' + (j.titles?.canonical || title), kind: 'encyclopedia', title: j.title, authors: 'Wikipedia contributors', year: j.timestamp ? Number(String(j.timestamp).slice(0, 4)) : null, date: j.timestamp || null,
    venue: 'Wikipedia', doi: null, url: j.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`, abstract: clean(j.extract), pubTypes: ['encyclopedia'], type: 'encyclopedia', citedBy: 0, openAccess: true, retracted: false, thumbnail: j.thumbnail?.source || null };
}

/** Daily most-viewed articles (what the public is looking at). day = Date, defaults to two days ago (data lags). */
export async function topViewed(day = new Date(Date.now() - 2 * 864e5)) {
  const d = day.toISOString().slice(0, 10).replace(/-/g, '/');
  const r = await getJSON(`https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/${d}`);
  if (!r.ok) return [];
  return (r.data.items?.[0]?.articles || []).filter((a) => !/^(Main_Page|Special:|Wikipedia:|Portal:|File:|Help:|Category:)/.test(a.article)).map((a) => ({ title: a.article.replace(/_/g, ' '), views: a.views, rank: a.rank }));
}
