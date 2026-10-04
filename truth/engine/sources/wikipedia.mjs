// Wikipedia: background context only (an encyclopedia is never the evidence for a headline claim). Free, no key.
import { getJSON } from '../lib/util.mjs';

export async function wikiSearch(query, limit = 3) {
  const j = await getJSON(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=${limit}&origin=*`);
  return (j.query?.search || []).map((s) => s.title);
}

export async function wikiSummary(title) {
  const j = await getJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`);
  if (j.type === 'disambiguation' || !j.extract) return null;
  return { key: `wiki:${j.titles?.canonical || title}`, provider: 'wikipedia', title: j.title, authors: 'Wikipedia contributors', year: j.timestamp ? Number(String(j.timestamp).slice(0, 4)) : null, date: j.timestamp || null, venue: 'Wikipedia',
    doi: null, url: j.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`, text: j.extract, pubTypes: ['encyclopedia'], cited_by: 0, open_access: true, retracted: false, preprint: false, thumbnail: j.thumbnail?.source || null };
}
