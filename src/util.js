import crypto from 'node:crypto';

export const sha1 = (s) => crypto.createHash('sha1').update(String(s)).digest('hex');
export const shortId = (s) => sha1(s).slice(0, 16);

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', trade: '™', reg: '®', copy: '©' };
export function decodeEntities(s = '') {
  return String(s).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function stripHtml(s = '') {
  return decodeEntities(
    decodeEntities(String(s))
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ').trim();
}

export function truncate(s = '', n = 280) {
  s = String(s).trim();
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), n - 30)).replace(/[,;:.\s]+$/, '') + '…';
}

const TRACKING = /^(utm_|fbclid|gclid|mc_|ocid|cmpid|ref$|ref_|taid|smid|cid$|__twitter|at_|ito$|dicbo|sr_share|src$|campaign)/i;
export function canonicalUrl(raw) {
  try {
    let u = new URL(String(raw).trim());
    // Bing News click-through → original article
    if (/bing\.com$/i.test(u.hostname) && u.pathname.includes('apiclick') && u.searchParams.get('url')) {
      u = new URL(u.searchParams.get('url'));
    }
    u.hash = '';
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    u.protocol = 'https:';
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    u.searchParams.sort();
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.replace(/\/+$/, '');
    return u.toString();
  } catch {
    return String(raw || '').trim();
  }
}

export function originalUrl(raw) {
  // canonicalUrl without host/protocol rewriting (keeps the link the publisher used).
  try {
    let u = new URL(String(raw).trim());
    if (/bing\.com$/i.test(u.hostname) && u.pathname.includes('apiclick') && u.searchParams.get('url')) u = new URL(u.searchParams.get('url'));
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return String(raw || '').trim();
  }
}

export function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

export function parseDate(s) {
  if (!s) return null;
  const t = Date.parse(String(s).trim());
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

const STOP = new Set('a an the and or of to in on at for with by from is are was were be as it its this that after over into new says said report reports amid about vs than up out more will has have how why what who'.split(' '));
export function titleTokens(title = '') {
  return [...new Set(
    String(title).toLowerCase().normalize('NFKD').replace(/[’']/g, '').replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w)),
  )];
}

export function jaccard(a, b) {
  if (!a.length || !b.length) return 0;
  const sb = new Set(b);
  let inter = 0;
  for (const x of a) if (sb.has(x)) inter++;
  return inter / (a.length + b.length - inter);
}

// Local-date helpers (America/Chicago)
export function localDateKey(d = new Date(), tz = 'America/Chicago') {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));
}

export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await fn(items[idx], idx); } catch (e) { out[idx] = { error: e }; }
    }
  });
  await Promise.all(workers);
  return out;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
