// Runner-side check of the evidence sources: do they answer, and does what comes back survive our mapping?
import fs from 'node:fs';
import * as epmc from './sources/europepmc.mjs';
import * as oalex from './sources/openalex.mjs';
import * as crossref from './sources/crossref.mjs';
import { gather } from './sources/index.mjs';
import { stats, http } from './lib/http.mjs';

const QUERIES = ['financial scarcity cognitive load decision making', 'anchoring effect meta-analysis', 'Flynn effect IQ scores decline', 'placebo effect open-label'];
const out = { at: new Date().toISOString(), sources: {}, gather: {}, extra: {} };
for (const [name, mod] of Object.entries({ europepmc: epmc, openalex: oalex, crossref })) {
  out.sources[name] = [];
  for (const q of QUERIES) { const t0 = Date.now(); const r = await mod.search(q, { limit: 8 }); out.sources[name].push({ q, ok: r.ok, error: r.error ? String(r.error).slice(0, 200) : undefined, total: r.total, ms: Date.now() - t0, items: r.items.slice(0, 5).map((s) => ({ title: s.title.slice(0, 110), year: s.year, type: s.type, citedBy: s.citedBy, venue: s.venue.slice(0, 50), abstract: s.abstract.length, doi: s.doi })) }); }
}
for (const q of QUERIES.slice(0, 2)) { const g = await gather([q]); out.gather[q] = { stats: g.stats, sources: g.sources.map((s) => ({ provider: s.provider, title: s.title.slice(0, 100), year: s.year, type: s.type, citedBy: s.citedBy, rel: s.rel, score: s.score })) }; }
// other keyless indexes worth knowing about
for (const [name, url] of Object.entries({
  arxiv: 'http://export.arxiv.org/api/query?search_query=all:%22large+language+models%22+AND+all:deception&max_results=3',
  doaj: 'https://doaj.org/api/search/articles/' + encodeURIComponent('bibjson.abstract:"financial scarcity" AND bibjson.abstract:cognitive') + '?pageSize=3',
  openaire: 'https://api.openaire.eu/search/publications?keywords=' + encodeURIComponent('financial scarcity cognitive') + '&format=json&size=3',
  eric: 'https://api.ies.ed.gov/eric/?search=' + encodeURIComponent('learning styles matching hypothesis') + '&format=json&rows=3',
  wikipedia_top: 'https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/2026/10/02',
  google_news_science: 'https://news.google.com/rss/search?q=' + encodeURIComponent('study finds psychology OR neuroscience when:7d') + '&hl=en-US&gl=US&ceid=US:en',
})) { const t0 = Date.now(); const r = await http(url, {}, { retries: 0, cache: false }); out.extra[name] = { status: r.status, ms: Date.now() - t0, type: r.type, bytes: r.text.length, sample: r.text.slice(0, 700), error: r.error }; }
out.http = stats;
fs.mkdirSync('probe-out', { recursive: true }); fs.writeFileSync('probe-out/sources.json', JSON.stringify(out, null, 1)); console.log(JSON.stringify(out.http));
