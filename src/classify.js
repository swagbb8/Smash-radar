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
  deal: /(\$\d[\d,.]*\s*(off|discount)|\d{1,2}% off|price (drop|cut)|on sale|lowest price|\bBOGO\b|\bdiscount(ed)?\b|\bcoupon|\bclearance\b|deal of the day|Prime Day|Black Friday|Cyber Monday|\bfree (shipping|drink|item|fries|coffee)|\bdeals?\b(?! with)(?= (on|for|at|of|alert))|save (up to )?\$?\d)/i,
  product: /\b(launch(es|ed|ing)?|unveil(s|ed|ing)?|introduc(es|ed|ing)|debut(s|ed)?|new flavou?rs?|limited[- ]edition|now available|drops? (today|this|on|in)|releases?d?|reveal(s|ed)?|pre-?orders?|coming soon|returns? (to|for)|rolls? out|new (menu|item|product|phone|model|shoe|sneaker|colorway|game|console|GPU|chip|laptop|watch|drink|flavor|collection|trailer|update)|first look|announces? (new|the|its))\b/i,
  opening: /\b(grand opening|now open|opens? (its|a|new|first|in|on|this)|opening (soon|date|day|in)|set to open|to open (in|on|this|next)|ribbon[- ]cutting|new location|coming to|breaks? ground)\b/i,
  closing: /\b(closing (its|all|stores?|locations?|down)|store closures?|to close (its|all|\d+)|shutting down)\b/i,
  breaking: /\b(breaking|just in|developing|live updates?|urgent|killed|dead|dies|explosion|shooting|earthquake|evacuat\w*|state of emergency|tornado warning|hurricane|wildfire|manhunt|active shooter|plane crash)\b/i,
  politicsDeal: /\b(trade|peace|ceasefire|budget|nuclear|plea|hostage|merger|acquisition|contract) deal\b/i,
};

export function detectFlags(text, sourceCategory) {
  const recall = RX.recall.test(text);
  const deal = sourceCategory === 'deals' || (RX.deal.test(text) && !RX.politicsDeal.test(text));
  const opening = RX.opening.test(text);
  const closing = RX.closing.test(text);
  const product = RX.product.test(text) && !recall;
  const breaking = RX.breaking.test(text);
  return { recall, deal, opening, closing, product, breaking };
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
