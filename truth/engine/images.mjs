// Picture desk: find photographs that are legally usable in commercial, modified work, download them, and keep the credit.
//   Openverse (CC0 / public-domain mark / CC BY only — no NC, ND or SA)     https://api.openverse.org
//   NASA image library (public domain)                                    https://images.nasa.gov
//   Wikimedia Commons (public domain, CC0, CC BY only)                    https://commons.wikimedia.org
// No recognisable people on purpose: queries and scoring push toward places, objects, hands and silhouettes.
import fs from 'node:fs';
import path from 'node:path';
import { getJSON, http, qs } from './lib/http.mjs';
import { clean, keywords } from './lib/text.mjs';

const PEOPLE = /\b(portrait|selfie|face|faces|headshot|smile|smiling|wedding|bride|groom|baby|child|children|kid|kids|girl|boy|woman|women|man|men|family|model|actor|actress|singer|politician|president|minister|celebrity|team|crowd of|student|students|mr|mrs|dr)\b/i;
const JUNK = /\b(logo|icon|clipart|diagram|chart|map|screenshot|poster|flyer|drawing|cartoon|illustration|painting|stamp|coat of arms|flag|svg|text|meme|advert)\b/i;
const MOOD = /\b(night|dark|shadow|silhouette|empty|abandoned|fog|mist|neon|city|street|window|screen|light|corridor|tunnel|rain|black and white|monochrome|smoke|glow)\b/i;

function score(c, query) {
  const qk = new Set(keywords(query)); const text = `${c.title} ${(c.tags || []).join(' ')}`; const tk = new Set(keywords(text));
  let hit = 0; for (const w of qk) if (tk.has(w)) hit++;
  let s = (qk.size ? hit / qk.size : 0) * 4;
  const short = Math.min(c.width || 0, c.height || 0); s += short >= 1600 ? 2 : short >= 1000 ? 1.4 : short >= 700 ? 0.6 : -3;
  const ar = (c.width || 1) / (c.height || 1); s += ar < 1 ? 0.8 : ar < 1.6 ? 0.4 : -0.3;              // portrait and near-square crops best into 4:5
  if (PEOPLE.test(text)) s -= 3; if (JUNK.test(text)) s -= 4; if (MOOD.test(text)) s += 0.8;
  if (c.license === 'cc0' || c.license === 'pdm' || c.license === 'public domain') s += 0.4;         // nothing to attribute on the slide
  return s;
}

const LICENSE_NAME = { cc0: 'CC0', pdm: 'Public domain', by: 'CC BY' };

async function openverse(query, n = 12) {
  const r = await getJSON('https://api.openverse.org/v1/images/?' + qs({ q: query, license: 'cc0,pdm,by', license_type: 'commercial,modification', category: 'photograph', mature: 'false', page_size: n, size: 'large,medium' }));
  if (!r.ok) return { error: 'openverse ' + r.status, items: [] };
  return { items: (r.data.results || []).map((i) => ({ provider: 'openverse', id: i.id, url: i.url, thumb: i.thumbnail, width: i.width, height: i.height, title: clean(i.title || ''), tags: (i.tags || []).map((t) => t.name).slice(0, 25),
    creator: clean(i.creator || ''), license: i.license, licenseName: `${LICENSE_NAME[i.license] || i.license}${i.license_version && i.license === 'by' ? ' ' + i.license_version : ''}`, licenseUrl: i.license_url || '', page: i.foreign_landing_url || '', via: i.source || i.provider || '' })) };
}

async function nasa(query, n = 8) {
  const r = await getJSON('https://images-api.nasa.gov/search?' + qs({ q: query, media_type: 'image', page_size: n }));
  if (!r.ok) return { error: 'nasa ' + r.status, items: [] };
  return { items: (r.data.collection?.items || []).map((it) => { const d = it.data?.[0] || {}; const id = d.nasa_id; return { provider: 'nasa', id, url: `https://images-assets.nasa.gov/image/${encodeURIComponent(id)}/${encodeURIComponent(id)}~large.jpg`, thumb: it.links?.[0]?.href, width: 1920, height: 1440, title: clean(d.title || ''), tags: d.keywords || [],
    creator: 'NASA' + (d.center ? '/' + d.center : ''), license: 'public domain', licenseName: 'Public domain', licenseUrl: 'https://www.nasa.gov/nasa-brand-center/images-and-media/', page: `https://images.nasa.gov/details/${id}`, via: 'nasa' }; }).filter((x) => x.id) };
}

async function commons(query, n = 10) {
  const r = await getJSON('https://commons.wikimedia.org/w/api.php?' + qs({ action: 'query', generator: 'search', gsrsearch: `filetype:bitmap ${query}`, gsrnamespace: 6, gsrlimit: n, prop: 'imageinfo', iiprop: 'url|size|extmetadata|mime', iiurlwidth: 1600, format: 'json', origin: '*' }));
  if (!r.ok) return { error: 'commons ' + r.status, items: [] };
  return { items: Object.values(r.data.query?.pages || {}).map((p) => { const ii = p.imageinfo?.[0] || {}; const m = ii.extmetadata || {}; const lic = clean(m.LicenseShortName?.value || '');
    const ok = /^(public domain|cc0|pd\b|cc by \d|cc-by-\d)/i.test(lic) && !/sa|nc|nd/i.test(lic);
    return ok && /jpe?g|png/i.test(ii.mime || '') ? { provider: 'commons', id: String(p.pageid), url: ii.thumburl || ii.url, thumb: ii.thumburl, width: ii.thumbwidth || ii.width, height: ii.thumbheight || ii.height, title: clean(String(p.title).replace(/^File:/, '').replace(/\.[a-z]+$/i, '')), tags: clean(m.Categories?.value || '').split('|').slice(0, 15),
      creator: clean(m.Artist?.value || '').slice(0, 80), license: /public domain|cc0|^pd/i.test(lic) ? 'pdm' : 'by', licenseName: lic, licenseUrl: m.LicenseUrl?.value || '', page: ii.descriptionurl || '', via: 'wikimedia commons' } : null; }).filter(Boolean) };
}

/** Search every source for one idea → candidates sorted best first. */
export async function findImages(query, { space = false } = {}) {
  const q = clean(query).replace(/[^\w\s-]/g, ' ').slice(0, 90);
  const res = await Promise.all([openverse(q), commons(q), ...(space || /\b(space|earth|planet|galaxy|star|moon|sun|orbit|cosmos|universe|satellite|astronaut|nebula)\b/i.test(q) ? [nasa(q)] : [])]);
  const items = res.flatMap((r) => r.items).map((c) => ({ ...c, score: +score(c, q).toFixed(2) })).sort((a, b) => b.score - a.score);
  return { query: q, errors: res.map((r) => r.error).filter(Boolean), items };
}

export function creditOf(c) { const who = c.creator || c.via || 'Unknown'; return c.license === 'by' ? `${who} (${c.licenseName})` : c.provider === 'nasa' ? 'NASA' : `${who} (${c.licenseName})`; }

/** Download the best usable candidate for each idea. → [{ file, credit, license, page, query, title, width, height } | null] */
export async function fetchImages(ideas, dir, { prefix = 'img', minScore = 1.2, used = new Set() } = {}) {
  fs.mkdirSync(dir, { recursive: true }); const out = [];
  for (const [i, idea] of ideas.entries()) {
    const found = await findImages(idea); let got = null;
    for (const c of found.items.slice(0, 6)) {
      if (c.score < minScore || used.has(c.url)) continue;
      const r = await http(c.url, { headers: { accept: 'image/jpeg,image/png,image/*' } }, { binary: true, timeout: 40000, retries: 1, cache: false });
      if (!r.ok || !r.buffer || r.buffer.length < 30000 || !/image\/(jpe?g|png)/i.test(r.type)) continue;
      const ext = /png/i.test(r.type) ? 'png' : 'jpg'; const file = `${prefix}-${i + 1}.${ext}`; fs.writeFileSync(path.join(dir, file), r.buffer); used.add(c.url);
      got = { file, credit: creditOf(c), creator: c.creator, license: c.licenseName, licenseUrl: c.licenseUrl, page: c.page, via: c.via, title: c.title, query: found.query, width: c.width, height: c.height, score: c.score, bytes: r.buffer.length };
      break;
    }
    out.push(got || { file: null, query: found.query, error: found.errors.join('; ') || (found.items.length ? 'no candidate good enough' : 'nothing found'), candidates: found.items.length });
  }
  return out;
}
