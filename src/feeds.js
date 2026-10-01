// Feed parsing: RSS 2.0, Atom, Bing News RSS, Google News RSS, NWS alerts (GeoJSON).
// Dependency-free, tolerant of messy real-world XML.
import { decodeEntities, stripHtml, parseDate, originalUrl } from './util.js';

function unCdata(s = '') {
  return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

function tag(block, name) {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i');
  const m = block.match(re);
  return m ? unCdata(m[1]) : '';
}

function attr(block, name, attrName) {
  const re = new RegExp(`<${name}\\b([^>]*)\\/?>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(block))) {
    const a = m[1].match(new RegExp(`\\b${attrName}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
    if (a) out.push({ value: decodeEntities(a[2] ?? a[3]), raw: m[1] });
  }
  return out;
}

function firstImage(block) {
  // media:content / media:thumbnail / enclosure(image) / News:Image / <img> in content
  for (const n of ['media:content', 'media:thumbnail']) {
    const hits = attr(block, n, 'url').filter((h) => !/medium\s*=\s*"(video|audio)"/i.test(h.raw) && !/\.(mp4|mp3|m3u8)(\?|$)/i.test(h.value));
    if (hits.length) {
      // prefer the widest
      hits.sort((a, b) => (Number((b.raw.match(/width="(\d+)"/) || [])[1]) || 0) - (Number((a.raw.match(/width="(\d+)"/) || [])[1]) || 0));
      return hits[0].value;
    }
  }
  const enc = attr(block, 'enclosure', 'url').find((h) => /image\//i.test(h.raw) || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(h.value));
  if (enc) return enc.value;
  const bing = tag(block, 'News:Image');
  if (bing) {
    const u = decodeEntities(bing).replace(/^http:/, 'https:');
    // Bing serves any size from the same id: ask for a large 16:9 crop instead of the tiny default.
    return /[?&]id=/.test(u) ? `${u.replace(/&(w|h|c|rs|p|qlt)=[^&]*/g, '')}&w=960&h=540&c=7&rs=1&qlt=90` : u;
  }
  const html = decodeEntities(tag(block, 'content:encoded') || tag(block, 'description') || tag(block, 'content') || tag(block, 'summary'));
  const img = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (img && !/feedburner|pixel|tracking|1x1|spacer/i.test(img[1])) return img[1];
  return null;
}

export function parseXmlFeed(xml, source = {}) {
  xml = String(xml || '');
  const items = [];
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blocks = xml.match(isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi) || [];
  for (const b of blocks) {
    let title = stripHtml(tag(b, 'title'));
    let link = '';
    if (isAtom) {
      const links = attr(b, 'link', 'href');
      const alt = links.find((l) => /rel\s*=\s*["']alternate["']/i.test(l.raw)) || links.find((l) => !/rel\s*=/i.test(l.raw)) || links[0];
      link = alt ? alt.value : '';
    } else {
      link = decodeEntities(tag(b, 'link')) || '';
      if (!link) {
        const g = tag(b, 'guid');
        if (/^https?:\/\//.test(g)) link = decodeEntities(g);
      }
    }
    if (!title || !link) continue;
    const rawDesc = tag(b, 'description') || tag(b, 'summary') || tag(b, 'content:encoded') || tag(b, 'content');
    let summary = stripHtml(rawDesc);
    const published = parseDate(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'dc:date') || tag(b, 'updated'));
    const updated = parseDate(tag(b, 'updated') || tag(b, 'atom:updated'));
    let publisher = '';
    let publisherUrl = '';
    const categories = (b.match(/<category[^>]*>([\s\S]*?)<\/category>/gi) || []).map((c) => stripHtml(unCdata(c.replace(/<\/?category[^>]*>/gi, ''))));

    if (source.type === 'bing') {
      publisher = stripHtml(tag(b, 'News:Source'));
    } else if (source.type === 'google') {
      const src = b.match(/<source[^>]*url="([^"]*)"[^>]*>([\s\S]*?)<\/source>/i);
      if (src) { publisher = stripHtml(src[2]); publisherUrl = decodeEntities(src[1]); }
      // Google appends " - Publisher" to titles; its description only repeats the headline.
      if (publisher && title.endsWith(` - ${publisher}`)) title = title.slice(0, -(publisher.length + 3)).trim();
      const d = summary.replace(publisher, '').trim();
      if (!d || d.startsWith(title.slice(0, 40)) || d.length < 40) summary = '';
    }

    // geo:Point (Patch) — town-level coordinates
    const lat = parseFloat(tag(b, 'geo:lat'));
    const lon = parseFloat(tag(b, 'geo:long'));

    items.push({
      title,
      link: source.type === 'google' ? decodeEntities(link) : originalUrl(decodeEntities(link)),
      guid: stripHtml(tag(b, 'guid') || tag(b, 'id')) || null,
      summary,
      publishedAt: published,
      updatedAt: updated,
      imageUrl: firstImage(b),
      publisher: publisher || null,
      publisherUrl: publisherUrl || null,
      feedCategories: categories.filter(Boolean),
      geo: Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null,
    });
  }
  return items;
}

// National Weather Service alerts (GeoJSON from api.weather.gov)
export function parseNwsAlerts(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  const out = [];
  for (const f of data?.features || []) {
    const p = f.properties || {};
    if (p.status && p.status !== 'Actual') continue;
    if (p.messageType === 'Cancel') continue;
    const headline = p.headline || `${p.event} for ${p.areaDesc}`;
    out.push({
      title: `${p.event}: ${shortArea(p.areaDesc)}`,
      link: 'https://forecast.weather.gov/showsigwx.php?warnzone=ILZ013&warncounty=ILC043&local_place1=DuPage+County+IL',
      guid: p.id,
      summary: [headline, (p.description || '').replace(/\s+/g, ' ').trim()].filter(Boolean).join(' — '),
      instruction: (p.instruction || '').replace(/\s+/g, ' ').trim(),
      publishedAt: parseDate(p.sent || p.effective),
      updatedAt: parseDate(p.sent),
      expiresAt: parseDate(p.ends || p.expires),
      imageUrl: null,
      publisher: p.senderName || 'National Weather Service',
      feedCategories: [p.event, p.severity, p.urgency].filter(Boolean),
      nws: { event: p.event, severity: p.severity, urgency: p.urgency, areaDesc: p.areaDesc, references: (p.references || []).map((r) => r.identifier), messageType: p.messageType },
    });
  }
  return out;
}

function shortArea(a = '') {
  const parts = a.split(';').map((s) => s.trim()).filter(Boolean);
  return parts.length > 3 ? `${parts.slice(0, 3).join(', ')} +${parts.length - 3} more` : parts.join(', ');
}

// Article page metadata (for images + better summaries)
export function parseArticleMeta(html, baseUrl) {
  const head = String(html).slice(0, 300000);
  const meta = (prop) => {
    const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, 'i');
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, 'i');
    const m = head.match(re1) || head.match(re2);
    return m ? decodeEntities(m[1]).trim() : '';
  };
  const abs = (u) => { try { return u ? new URL(u, baseUrl).toString() : ''; } catch { return ''; } };
  const canon = head.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) || head.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']canonical["']/i);
  return {
    image: abs(meta('og:image:secure_url') || meta('og:image') || meta('twitter:image') || meta('twitter:image:src')),
    description: meta('og:description') || meta('description') || meta('twitter:description'),
    title: meta('og:title'),
    siteName: meta('og:site_name'),
    canonical: abs((canon && canon[1]) || meta('og:url')),
    published: parseDate(meta('article:published_time') || meta('og:published_time') || meta('pubdate')),
  };
}
