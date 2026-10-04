// One-off connectivity probe: which free services answer from a GitHub runner, and which AI models can be called.
import fs from 'node:fs';
const out = { at: new Date().toISOString(), node: process.version, env: {}, models: {}, apis: {} };
const T = (ms) => AbortSignal.timeout(ms);
const short = (s, n = 400) => (typeof s === 'string' ? s : JSON.stringify(s)).slice(0, n);
async function get(name, url, opt = {}, pick = (t) => short(t)) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { ...opt, signal: T(25000), headers: { 'user-agent': 'TheTruthEngine/0.1 (https://github.com/swagbb8/Smash-radar)', ...(opt.headers || {}) } });
    const ct = r.headers.get('content-type') || ''; const body = ct.includes('image') ? `[image ${(await r.arrayBuffer()).byteLength} bytes]` : await r.text();
    let sample; try { sample = pick(body, r); } catch (e) { sample = 'pick failed: ' + e.message + ' | ' + short(body, 200); }
    out.apis[name] = { status: r.status, ms: Date.now() - t0, type: ct.slice(0, 40), cors: r.headers.get('access-control-allow-origin'), sample };
  } catch (e) { out.apis[name] = { error: String(e.message || e), ms: Date.now() - t0 }; }
}
const J = (f) => (t) => short(f(JSON.parse(t)), 700);

out.env.anthropic_key = !!process.env.ANTHROPIC_API_KEY;
out.env.github_token = !!process.env.GITHUB_TOKEN;
for (const k of ['BRAVE_API_KEY', 'TAVILY_API_KEY', 'OPENAI_API_KEY', 'UNSPLASH_ACCESS_KEY', 'PEXELS_API_KEY', 'IG_ACCESS_TOKEN', 'POSTIZ_API_KEY']) out.env[k] = !!process.env[k];

// ---- GitHub Models
const GH = { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, 'content-type': 'application/json', accept: 'application/vnd.github+json' };
try {
  const r = await fetch('https://models.github.ai/catalog/models', { headers: GH, signal: T(25000) });
  const txt = await r.text(); out.models.catalog_status = r.status;
  try { const arr = JSON.parse(txt); out.models.catalog = arr.map((m) => ({ id: m.id, tier: m.rate_limit_tier, in: m.limits?.max_input_tokens, out: m.limits?.max_output_tokens, caps: (m.capabilities || []).join(','), mod: (m.supported_input_modalities || []).join(',') })); } catch { out.models.catalog_raw = short(txt, 600); }
} catch (e) { out.models.catalog_error = String(e.message || e); }
const want = (process.env.PROBE_MODELS || 'openai/gpt-4.1,openai/gpt-4o,openai/gpt-4.1-mini,openai/gpt-4o-mini,openai/gpt-5-mini,openai/gpt-5,openai/gpt-5-chat,meta/llama-4-maverick-17b-128e-instruct-fp8,deepseek/deepseek-v3-0324,mistral-ai/mistral-medium-2505,xai/grok-3-mini').split(',');
out.models.chat = {};
for (const model of want) {
  const t0 = Date.now();
  try {
    const r = await fetch('https://models.github.ai/inference/chat/completions', { method: 'POST', headers: GH, signal: T(60000), body: JSON.stringify({ model, messages: [{ role: 'system', content: 'Reply with compact JSON only.' }, { role: 'user', content: 'Return {"ok":true,"fact":"<one true sentence about sleep and memory>"}' }], response_format: { type: 'json_object' }, max_tokens: 120 }) });
    const txt = await r.text(); const h = {}; for (const [k, v] of r.headers) if (/ratelimit|retry/i.test(k)) h[k] = v;
    let content = null; try { content = JSON.parse(txt).choices?.[0]?.message?.content; } catch {}
    out.models.chat[model] = { status: r.status, ms: Date.now() - t0, content: content ? short(content, 200) : short(txt, 300), limits: h };
  } catch (e) { out.models.chat[model] = { error: String(e.message || e) }; }
}
if (process.env.ANTHROPIC_API_KEY) {
  try { const r = await fetch('https://api.anthropic.com/v1/models?limit=30', { headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }, signal: T(20000) }); const j = await r.json(); out.models.anthropic = { status: r.status, ids: (j.data || []).map((m) => m.id) }; } catch (e) { out.models.anthropic = { error: String(e.message || e) }; }
}

// ---- research + signal + image services (all keyless)
await Promise.all([
  get('openalex', 'https://api.openalex.org/works?search=social%20media%20loneliness&per-page=2&select=id,doi,title,publication_year,type,cited_by_count,is_retracted,primary_location,abstract_inverted_index&mailto=truth-engine@users.noreply.github.com', {}, J((j) => ({ count: j.meta?.count, first: j.results?.map((w) => ({ t: w.title, y: w.publication_year, type: w.type, c: w.cited_by_count, doi: w.doi, src: w.primary_location?.source?.display_name, abs: !!w.abstract_inverted_index })) }))),
  get('crossref', 'https://api.crossref.org/works?query=sleep%20deprivation%20memory&rows=2&select=DOI,title,issued,container-title,is-referenced-by-count,type&mailto=truth-engine@users.noreply.github.com', {}, J((j) => j.message?.items?.map((w) => ({ t: w.title?.[0], doi: w.DOI, j: w['container-title']?.[0], c: w['is-referenced-by-count'] })))),
  get('pubmed_search', 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=3&sort=relevance&term=smartphone%20attention%20meta-analysis', {}, J((j) => j.esearchresult)),
  get('europepmc', 'https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=doomscrolling&format=json&pageSize=2&resultType=core', {}, J((j) => ({ hits: j.hitCount, first: j.resultList?.result?.map((w) => ({ t: w.title, y: w.pubYear, j: w.journalTitle, abs: (w.abstractText || '').length, cites: w.citedByCount, types: w.pubTypeList?.pubType })) }))),
  get('semanticscholar', 'https://api.semanticscholar.org/graph/v1/paper/search?query=dopamine%20social%20media&limit=2&fields=title,year,abstract,citationCount,externalIds,publicationTypes,journal', {}, J((j) => j.data?.map((w) => ({ t: w.title, y: w.year, c: w.citationCount, types: w.publicationTypes, abs: (w.abstract || '').length })))),
  get('wikipedia_summary', 'https://en.wikipedia.org/api/rest_v1/page/summary/Attention_economy', {}, J((j) => ({ title: j.title, extract: (j.extract || '').slice(0, 160), thumb: j.thumbnail?.source }))),
  get('wikipedia_search', 'https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=planned%20obsolescence&format=json&srlimit=3&origin=*', {}, J((j) => j.query?.search?.map((s) => s.title))),
  get('wikipedia_top', `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/${new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10).replace(/-/g, '/')}`, {}, J((j) => j.items?.[0]?.articles?.slice(2, 12).map((a) => a.article))),
  get('arxiv', 'http://export.arxiv.org/api/query?search_query=all:%22large%20language%20models%22&max_results=1&sortBy=submittedDate', {}, (t) => (t.match(/<title>[^<]+<\/title>/g) || []).slice(0, 3).join(' | ')),
  get('google_news_rss', 'https://news.google.com/rss/search?q=%22new%20study%22%20brain&hl=en-US&gl=US&ceid=US:en', {}, (t) => (t.match(/<title>[^<]+<\/title>/g) || []).slice(1, 5).join(' | ')),
  get('gdelt', 'https://api.gdeltproject.org/api/v2/doc/doc?query=%22artificial%20intelligence%22%20sourcelang:eng&mode=artlist&maxrecords=3&format=json&timespan=1d', {}, J((j) => j.articles?.map((a) => a.title + ' @' + a.domain))),
  get('hackernews', 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=5', {}, J((j) => j.hits?.map((h) => h.title))),
  get('reddit', 'https://www.reddit.com/r/science/top.json?t=week&limit=3', {}, J((j) => j.data?.children?.map((c) => c.data.title))),
  get('sciencedaily_rss', 'https://www.sciencedaily.com/rss/mind_brain.xml', {}, (t) => (t.match(/<title>[^<]+<\/title>/g) || []).slice(1, 4).join(' | ')),
  get('ourworldindata', 'https://ourworldindata.org/grapher/share-of-individuals-using-the-internet.csv?csvType=filtered&country=~OWID_WRL', {}, (t) => t.split('\n').slice(0, 2).join(' / ') + ' … ' + t.trim().split('\n').slice(-1)[0]),
  get('worldbank', 'https://api.worldbank.org/v2/country/WLD/indicator/IT.NET.USER.ZS?format=json&mrv=2', {}, J((j) => j[1]?.map((d) => d.date + ':' + d.value))),
  get('openverse', 'https://api.openverse.org/v1/images/?q=empty%20subway%20night&license=cc0,pdm,by&page_size=3&mature=false', {}, J((j) => ({ count: j.result_count, first: j.results?.map((i) => ({ url: i.url, w: i.width, h: i.height, lic: i.license, by: i.creator, src: i.source })) }))),
  get('commons', 'https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=filetype:bitmap%20smartphone%20night&gsrnamespace=6&gsrlimit=3&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1200&format=json&origin=*', {}, J((j) => Object.values(j.query?.pages || {}).map((p) => ({ t: p.title, url: p.imageinfo?.[0]?.thumburl, w: p.imageinfo?.[0]?.width, lic: p.imageinfo?.[0]?.extmetadata?.LicenseShortName?.value })))),
  get('nasa_images', 'https://images-api.nasa.gov/search?q=earth%20at%20night&media_type=image&page_size=2', {}, J((j) => j.collection?.items?.map((i) => ({ t: i.data?.[0]?.title, href: i.links?.[0]?.href })))),
  get('pexels_nokey', 'https://api.pexels.com/v1/search?query=city&per_page=1', {}, (t) => short(t, 120)),
  get('pollinations_text', 'https://text.pollinations.ai/Reply%20with%20the%20single%20word%20OK', {}, (t) => short(t, 200)),
  get('pollinations_image', 'https://image.pollinations.ai/prompt/cinematic%20black%20and%20white%20photo%20of%20a%20person%20lit%20by%20a%20phone%20screen%20in%20a%20dark%20room?width=540&height=675&nologo=true&seed=7', {}, (t) => t),
  get('duckduckgo_html', 'https://html.duckduckgo.com/html/?q=pew%20research%20teens%20social%20media%202024', {}, (t) => (t.match(/result__a[^>]*>[^<]+/g) || []).slice(0, 3).join(' | ') || short(t, 150)),
  get('cdc_data', 'https://data.cdc.gov/resource/9bhg-hcku.json?$limit=1', {}, (t) => short(t, 200)),
  get('who_gho', "https://ghoapi.azureedge.net/api/Indicator?$filter=contains(IndicatorName,'sleep')", {}, J((j) => j.value?.slice(0, 3).map((v) => v.IndicatorName))),
]);
fs.mkdirSync('probe-out', { recursive: true }); fs.writeFileSync('probe-out/probe.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1).slice(0, 6000));
