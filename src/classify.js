// Classification: brands, categories, flags (product/deal/recall/opening/breaking), and "why it matters".
import { BRANDS, BRAND_CONTEXT, BRAND_NEGATIVE, CATEGORIES } from './config.js';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const brandMatchers = BRANDS.map((b) => {
  const names = [b.name, ...b.aliases].map((n) => esc(n).replace(/[’']/g, "['’]?"));
  // Case-sensitive on purpose: "Target"/"Apple"/"Monster" vs everyday words.
  const ci = /^(adidas|HOKA|GHOST|PRIME|NVIDIA|AMD|ASICS|DJI|GMC|BMW)$/i.test(b.name);
  return { ...b, re: new RegExp(`(?<![\\w-])(${names.join('|')})(?![\\w-])`, ci ? 'i' : '') };
});

export function detectBrands(text) {
  const out = [];
  for (const b of brandMatchers) {
    if (!b.re.test(text)) continue;
    const ctx = BRAND_CONTEXT[b.id];
    if (ctx && !ctx.test(text)) continue;
    const neg = BRAND_NEGATIVE[b.id];
    if (neg && neg.test(text) && !(ctx && ctx.test(text.replace(neg, '')))) continue;
    out.push(b);
  }
  return out;
}

const RX = {
  recall: /\brecall(s|ed|ing)?\b/i,
  deal: /(\$\d[\d,.]*\s*(off|discount)|\d{1,2}% off|price (drop|cut)|(?<!(go|goes|going|went|will|be) )on sale(?! (in|on|starting|from|this|next|beginning|later|early|late|by))|lowest price|\bBOGO\b|\bdiscount(ed)?\b|\bcoupon|\bclearance\b|deal of the day|Prime Day|Black Friday|Cyber Monday|\bfree (shipping|drink|item|fries|coffee)|\bdeals?\b(?! with)(?= (on|for|at|of|alert))|save (up to )?\$?\d)/i,
  product: /\b(launch(es|ed|ing)?|unveil(s|ed|ing)?|introduc(es|ed|ing)|debut(s|ed)?|new flavou?rs?|limited[- ]edition|now available|drops? (today|this|on|in)|releases?d?|reveal(s|ed)?|pre-?orders?|coming soon|returns? (to|for)|rolls? out|new (menu|item|product|phone|model|shoe|sneaker|colorway|game|console|GPU|chip|laptop|watch|drink|flavor|collection|trailer|update)|first look|announces? (new|the|its))\b/i,
  opening: /\b(grand opening|now open|opens? (its|a|new|first|in|on|this)|opening (soon|date|day|in)|set to open|to open (in|on|this|next)|ribbon[- ]cutting|new location|coming to|breaks? ground)\b/i,
  closing: /\b(closing (its|all|stores?|locations?|down)|store closures?|to close (its|all|\d+)|shutting down)\b/i,
  breaking: /\b(breaking|just in|developing|live updates?|urgent|killed|dead|dies|explosion|shooting|earthquake|evacuat\w*|state of emergency|tornado warning|hurricane|wildfire|manhunt|active shooter|plane crash)\b/i,
  limited: /\b(limited[- ](edition|time|run|release|drop|quantities)|while supplies last|for a limited time|exclusive drop|only \d[\d,]* (units|made))\b/i,
  discontinued: /\b(discontinu\w*|no longer (be )?(available|sold|offered|making)|being pulled|pulled from (menus|shelves)|axed|farewell to|last chance|phas(e|ing) out)\b/i,
  rumor: /\b(rumou?r(s|ed)?|reportedly|tipped|unconfirmed|could launch|may launch|expected to (launch|announce|reveal))\b/i,
  leak: /\b(leak(s|ed)?|leaker)\b/i,
  politicsDeal: /\b(trade|peace|ceasefire|budget|nuclear|plea|hostage|merger|acquisition|contract) deal\b/i,
};

export function detectFlags(text, sourceCategory) {
  const recall = RX.recall.test(text);
  const deal = sourceCategory === 'deals' || (RX.deal.test(text) && !RX.politicsDeal.test(text));
  const opening = RX.opening.test(text);
  const closing = RX.closing.test(text);
  const product = RX.product.test(text) && !recall;
  const breaking = RX.breaking.test(text);
  const limited = RX.limited.test(text);
  const discontinued = RX.discontinued.test(text);
  const leak = RX.leak.test(text);
  const rumor = !leak && RX.rumor.test(text);
  return { recall, deal, opening, closing, product, breaking, limited, discontinued, rumor, leak };
}

const CAT_IDS = new Set(CATEGORIES.map((c) => c.id));

export function classify({ title, summary, source, dupage }) {
  const text = `${title}. ${summary || ''}`;
  const brands = detectBrands(text);
  const flags = detectFlags(text, source.category);
  const cats = new Set([source.category]);
  for (const b of brands) cats.add(b.category);
  if (flags.recall) cats.add('recalls');
  if (flags.deal) cats.add('deals');
  if (flags.opening || flags.closing) cats.add('openings');
  if (dupage && (dupage.status === 'confirmed' || dupage.status === 'verified' || dupage.status === 'nearby')) cats.add('dupage');
  else cats.delete('dupage');
  // A "product" is a launch/release tied to a consumer brand or product category.
  const productish = brands.length > 0 || ['tech', 'auto', 'gaming', 'energy', 'fitness', 'food', 'clothing', 'retail'].includes(source.category);
  flags.product = flags.product && productish;
  let primary = source.category;
  if (primary === 'dupage' && !cats.has('dupage')) primary = brands[0]?.category || 'news';
  if (source.category === 'news' && brands.length && !flags.breaking) primary = brands[0].category;
  return {
    category: CAT_IDS.has(primary) ? primary : 'news',
    categories: [...cats].filter((c) => CAT_IDS.has(c)),
    brands: brands.map((b) => b.name),
    brandIds: brands.map((b) => b.id),
    flags,
  };
}

const catLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label || id;

// Rule-based "why it matters" (optionally replaced by AI enrichment when a key is configured).
export function whyItMatters({ category, brands = [], flags = {}, dupage, official, nws, sourceName }) {
  const b = brands[0];
  if (nws) {
    const sev = nws.severity && nws.severity !== 'Unknown' ? `${nws.severity.toLowerCase()} ` : '';
    return `Active ${sev}National Weather Service ${nws.event?.toLowerCase() || 'alert'} covering DuPage County — check conditions before you head out.`;
  }
  if (dupage && (dupage.status === 'confirmed' || dupage.status === 'verified')) {
    const where = dupage.places.filter((p) => p !== 'DuPage County').join(', ') || 'DuPage County';
    const roads = dupage.roads?.length ? ` Watch for impacts on ${dupage.roads.join(', ')}.` : '';
    const inc = dupage.incident?.id;
    if (inc === 'crash' || inc === 'closure' || inc === 'traffic' || inc === 'construction') return `Local traffic impact in ${where} — could affect your drive or add delays.${roads}`;
    if (inc === 'metra') return `Metra service issue affecting DuPage riders — check train times before heading to the station.`;
    if (inc === 'fire' || inc === 'emergency') return `Active emergency response in ${where} — avoid the area if you can and follow official updates.${roads}`;
    if (inc === 'police') return `Public-safety situation in ${where} — right in your area.${roads}`;
    if (inc === 'flooding' || inc === 'weather') return `Weather hazard hitting ${where} — roads, basements, and commutes may be affected.`;
    if (inc === 'missing') return `Missing-person alert in ${where} — watch for the description and call police with any information.`;
    if (inc === 'trees') return `Downed trees or wires in ${where} — expect blocked roads and possible outages.`;
    if (inc === 'school') return `School news in ${where} — could affect schedules for local families.`;
    if (inc === 'business') return `Business change in ${where} — something opening or closing near you.`;
    if (inc === 'development') return `Development decision in ${where} — shapes what gets built near you.`;
    if (inc === 'event') return `Local event in ${where} — something to do close to home.`;
    if (inc === 'outage') return `Service outage in ${where} — may affect power, water, or utilities nearby.`;
    if (flags.opening) return `Something new is opening in ${where} — close to home.`;
    return `Happening in ${where}, inside DuPage County — news from your own backyard.`;
  }
  if (flags.recall) return `${b ? `If you own or bought ${b} products, check` : 'Check'} whether yours is affected — recalls usually mean a free fix, replacement, or refund, and sometimes a real safety risk.`;
  if (flags.deal) return `${b ? `${b} ` : ''}price move worth knowing about if you were already planning to buy — deals like this are often time-limited.`;
  if (flags.closing) return `${b || 'A retailer'} is closing locations — check whether a store you use is affected.`;
  if (flags.opening) return `${b || 'A new business'} is expanding with a new location — new options and often grand-opening promos.`;
  if (flags.product) {
    const what = { energy: 'drink or flavor', fitness: 'supplement or gear', tech: 'tech release', auto: 'vehicle news', gaming: 'game or hardware release', food: 'menu item', clothing: 'drop', retail: 'retail launch' }[category] || 'release';
    return `New ${b ? `${b} ` : ''}${what} — first look at something that just hit (or is about to hit) the market.`;
  }
  if (flags.breaking) return `Major developing story — details may change quickly as more is confirmed.`;
  if (official) return `Straight from ${sourceName} — an official first-party announcement, not secondhand reporting.`;
  if (b) return `Latest from ${b}, one of the brands you track in ${catLabel(category)}.`;
  return `Top ${catLabel(category)} story right now — context for what's changing today.`;
}

// ---------- detail extraction (computed on read, so it improves without re-collecting) ----------
const MONTH = '(Jan(uary)?|Feb(ruary)?|Mar(ch)?|Apr(il)?|May|June?|July?|Aug(ust)?|Sep(t(ember)?)?|Oct(ober)?|Nov(ember)?|Dec(ember)?)';
export function productDetails(title = '', summary = '') {
  const text = `${title}. ${summary}`;
  const price = (text.match(/(?:\$|USD\s?)\d{1,3}(?:,\d{3})*(?:\.\d{2})?(?:\s?(?:–|-|to)\s?\$\d[\d,.]*)?/) || [])[0] || null;
  const avail = (text.match(/\b(available (now|today|starting [^.,;]{3,30}|nationwide|in stores[^.,;]{0,25}|online[^.,;]{0,20})|pre-?orders? (open|start|begin)[^.,;]{0,30}|in stores (now|today|[^.,;]{3,25})|on shelves[^.,;]{0,25}|sold out|ships? [^.,;]{3,25}|coming soon|out now)/i) || [])[0] || null;
  const release = (text.match(new RegExp(`\\b(?:launch(?:es|ing)?|arriv(?:es|ing)|releas(?:es|ing)|drops?|available|debuts?|hits? (?:stores|shelves)|on sale)[^.;]{0,20}?\\b(${MONTH}\\.? \\d{1,2}(?:, \\d{4})?|(?:this|next) (?:week|month|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)|(?:on )?(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)|today|tomorrow)`, 'i')) || [])[1] || null;
  const variant = (text.match(/\b((?:[A-Z][\w'’&-]+ ){0,3}[A-Z][\w'’&-]+) (?:flavou?r|colorway|colou?r|edition)\b/) || [])[1] || null;
  const size = (text.match(/\b\d+(?:\.\d+)?\s?(?:fl\.? ?oz|oz|ml|lb|lbs|servings|GB|TB|inch|-inch|mm)\b/i) || [])[0] || null;
  const out = { price, availability: avail, releaseDate: release, variant, size };
  return Object.values(out).some(Boolean) ? out : null;
}

export function recallDetails(title = '', summary = '', { sourceId = '', brands = [] } = {}) {
  const t = title.replace(/\s+/g, ' ').trim().replace(/\.\s.*$/, '');
  let firm = null; let product = null; let reason = null;
  let [head, tail] = t.split(/:\s+/, 2);
  const SEP = '(?: due to | because of | because | over | after | for |$)';
  let m;
  if ((m = head.match(new RegExp(`^(.*?) (?:Recalls|Is Recalling|Announces (?:Voluntary )?(?:Nationwide )?Recall (?:of|on)|Issues (?:Voluntary )?(?:Nationwide )?(?:Allergy Alert and )?Recall (?:of|on)) (.*?)${SEP}(.*)$`, 'i')))) { firm = m[1]; product = m[2]; reason = m[3]; }
  else if ((m = head.match(new RegExp(`^(.*?) (?:Recalled|Being Recalled|Under Recall)${SEP}(.*)$`, 'i')))) { product = m[1]; reason = m[2]; }
  else if ((m = head.match(/^(?:.*?\b(?:Announces|Issues|Warns of|Orders) )?(.*?) Recall (?:after|over|due to|because of|for) (.*)$/i))) { product = m[1]; reason = m[2]; }
  else if ((m = head.match(new RegExp(`recall(?:s|ed|ing)? (?:of |on )?(.*?)${SEP}(.*)$`, 'i')))) { product = m[1]; reason = m[2]; }
  if (!reason && tail) reason = tail;
  if (product && !product.trim()) product = null;
  if (reason && !reason.trim()) reason = null;
  const text = `${t}. ${summary}`;
  if (!reason) reason = (text.match(/(?:due to|because of|over|risk of|may contain|could)\s([^.;]{8,140})/i) || [])[1] || null;
  const affected = (summary.match(/[^.]*\b(sold (?:at|in|through|from)|lot (?:codes?|numbers?)|UPC|model (?:numbers?|years?)|best[- ]by|VIN|units|model year)\b[^.]*\./i) || [])[0]?.trim() || null;
  const autoBrand = brands.some((b) => BRANDS.find((x) => x.name === b)?.category === 'auto');
  const vehicle = (autoBrand || /\b(vehicles?|trucks?|SUVs?|cars|NHTSA|model years?|pickups?|Jeeps?|Wagoneers?|sedans?|minivans?)\b/i.test(text)) && !/cpsc|fda|fsis/.test(sourceId);
  const medicine = /\b(tablets?|capsules?|medications?|medicines?|drugs?|pills?|prescription|eye drops)\b/i.test(text);
  const food = /\b(food|foods|FSIS|FDA|eat|drink|beverages?|allergens?|milk|cheese|meat|poultry|salmonella|listeria|E\. coli|undeclared|supplements?|snacks?)\b/i.test(text) || /fda|fsis/.test(sourceId);
  const action = medicine ? "Don't stop a prescription on your own. Check the lot number and ask your pharmacist or doctor about a replacement."
    : vehicle ? 'Check your VIN at nhtsa.gov/recalls. Dealers repair recalled vehicles for free.'
    : food ? "Don't eat or drink it. Throw it away or return it where you bought it for a full refund."
    : /cpsc/.test(sourceId) || /CPSC|hazard|injury|fire hazard|burn|choking/i.test(text) ? 'Stop using it right away and contact the company for a free refund, repair or replacement.'
    : 'Check the official notice to see if yours is affected, and stop using it if it is.';
  return {
    product: product ? product.replace(/^(its|their) /i, '').replace(/^\w/, (c) => c.toUpperCase()) : null,
    brand: brands[0] || firm || null,
    reason: reason ? reason.replace(/[.;]\s*$/, '') : null,
    affected,
    action,
    official: /cpsc|fda|fsis|nhtsa/.test(sourceId),
  };
}
