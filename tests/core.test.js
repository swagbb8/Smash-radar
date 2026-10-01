import test from 'node:test';
import assert from 'node:assert/strict';
import { parseXmlFeed, parseNwsAlerts, parseArticleMeta } from '../src/feeds.js';
import { verifyDupage } from '../src/dupage.js';
import { classify, detectBrands } from '../src/classify.js';
import { emptyState, ingest, computeStatus, queryStories, present } from '../src/engine.js';
import { canonicalUrl } from '../src/util.js';
import * as fx from './fixtures.js';

const src = (o) => ({ id: 'test', name: 'Test', category: 'news', tier: 'fast', reliability: 3, official: false, ...o });

test('Bing RSS: decodes click-through to publisher URL, source, image', () => {
  const items = parseXmlFeed(fx.bingDupage(), { type: 'bing' });
  assert.equal(items.length, 5);
  assert.equal(items[0].link, 'https://www.chicagotribune.com/2026/09/30/truck-railroad-bridge-naperville-collision/');
  assert.equal(items[0].publisher, 'Chicago Tribune');
  assert.match(items[0].imageUrl, /bing\.com\/th/);
});

test('Google RSS: strips " - Publisher" suffix and junk description', () => {
  const items = parseXmlFeed(fx.googleDupage(), { type: 'google' });
  assert.equal(items[0].title, 'Semi-truck causes I-88 crash in Naperville after striking railroad bridge');
  assert.equal(items[0].publisher, 'Chicago Tribune');
  assert.equal(items[0].summary, '');
});

test('Patch RSS: media thumbnail, geo, CDATA, tracking params removed', () => {
  const items = parseXmlFeed(fx.patchWheaton(), { type: 'rss' });
  assert.equal(items[0].imageUrl, 'https://patch.com/img/cdn20/test/cider.jpg');
  assert.deepEqual(items[0].geo, { lat: 41.8661, lon: -88.107 });
  assert.ok(!items[0].link.includes('utm_'));
});

test('Atom feed parses', () => {
  const [e] = parseXmlFeed(fx.atomFeed(), { type: 'rss' });
  assert.equal(e.link, 'https://news.xbox.com/en-us/game-pass-new-games/');
  assert.ok(e.publishedAt);
});

test('NWS alerts parse', () => {
  const [a] = parseNwsAlerts(fx.nwsDupage());
  assert.equal(a.nws.event, 'Flood Advisory');
  assert.ok(a.expiresAt);
});

test('article meta extraction', () => {
  const m = parseArticleMeta(fx.articleHtml(), 'https://www.example.com/a');
  assert.equal(m.image, 'https://cdn.example.com/og-image.jpg');
  assert.match(m.description, /Full article/);
});

test('canonical URL strips tracking + unwraps Bing', () => {
  assert.equal(canonicalUrl('http://www.Example.com/a/?utm_source=x&b=2#frag'), 'https://example.com/a?b=2');
  assert.equal(canonicalUrl('http://www.bing.com/news/apiclick.aspx?url=https%3a%2f%2fnews.site%2fx&c=1'), 'https://news.site/x');
});

// ---------- DuPage verification ----------
test('DuPage: highway alone is NOT a DuPage incident', () => {
  const r = verifyDupage({ title: 'Multi-vehicle crash shuts lanes on I-88', summary: 'Several vehicles collided on I-88 near the toll plaza.' });
  assert.equal(r.status, 'rejected');
  assert.deepEqual(r.roads, ['I-88']);
});
test('DuPage: I-290 in Chicago is not DuPage', () => {
  assert.equal(verifyDupage({ title: 'Crash on I-290 near Austin Boulevard in Chicago', summary: '' }).status, 'rejected');
});
test('DuPage: Naperville crash verified with roads + incident', () => {
  const r = verifyDupage({ title: 'Semi-truck causes I-88 crash in Naperville', summary: '' });
  assert.equal(r.status, 'verified');
  assert.deepEqual(r.places, ['Naperville']);
  assert.equal(r.incident.id, 'crash');
});
test('DuPage: Wheaton, Maryland is rejected', () => {
  const r = verifyDupage({ title: 'Police investigate shooting near Wheaton Plaza', summary: 'Montgomery County police in Wheaton, Maryland responded.', url: 'https://www.wusa9.com/x', publisher: 'WUSA9' });
  assert.equal(r.status, 'none');
});
test('DuPage: Wheaton from a Chicago outlet is verified', () => {
  assert.equal(verifyDupage({ title: 'Wheaton police investigate burglary', summary: '', url: 'https://www.dailyherald.com/x', publisher: 'Daily Herald' }).status, 'verified');
});
test('DuPage: Elmhurst, NY is rejected; Elmhurst, IL verified', () => {
  assert.equal(verifyDupage({ title: 'Fire in Elmhurst, Queens', summary: 'FDNY responded in Elmhurst, New York.' }).status, 'none');
  assert.equal(verifyDupage({ title: 'Fire in Elmhurst, Ill. home', summary: '' }).status, 'verified');
});
test('DuPage: Aurora is only "nearby" (mostly outside DuPage)', () => {
  assert.equal(verifyDupage({ title: 'Aurora police respond to crash on Route 59', summary: '', url: 'https://www.dailyherald.com/a' }).status, 'nearby');
});
test('DuPage: explicit county mention is confirmed; DuPage River is not', () => {
  assert.equal(verifyDupage({ title: 'DuPage County sheriff warns of scam', summary: '' }).status, 'confirmed');
  assert.equal(verifyDupage({ title: 'Kayakers rescued from DuPage River in Shorewood', summary: '' }).status, 'none');
});
test('DuPage: Addison Street (Chicago) and Addison Rae are not Addison, IL', () => {
  assert.equal(verifyDupage({ title: 'Crash near Addison Street and Clark in Chicago', summary: '' }).status, 'none');
  assert.equal(verifyDupage({ title: 'Addison Rae drops new single', summary: '' }).status, 'none');
});
test('DuPage: Patch filed under a DuPage town counts; regional Patch does not', () => {
  assert.equal(verifyDupage({ title: 'Festival returns this weekend', summary: '', url: 'http://patch.com/illinois/wheaton/festival' }).status, 'verified');
  assert.equal(verifyDupage({ title: 'Downpours could flood Chicago area', summary: '', url: 'http://patch.com/illinois/across-il/x' }).status, 'none');
});
test('DuPage: landmarks', () => {
  const r = verifyDupage({ title: 'Shooting reported at Oakbrook Center: police', summary: '' });
  assert.equal(r.status, 'verified');
  assert.equal(r.incident.id, 'police');
});

// ---------- brands / flags ----------
test('brands need context: Celsius temperature / Harrison Ford are not brands', () => {
  assert.deepEqual(detectBrands('It was 30 degrees Celsius in Paris as Harrison Ford visited').map((b) => b.name), []);
  assert.deepEqual(detectBrands('Monster Energy launches new Ultra flavor').map((b) => b.name), ['Monster']);
  assert.ok(detectBrands('Ford recalls F-150 trucks').some((b) => b.name === 'Ford'));
  assert.deepEqual(detectBrands('He had a target on his back').map((b) => b.name), []);
});
test('classification flags', () => {
  const c = classify({ title: 'Ford recalls 200,000 F-150 trucks over brake issue', summary: '', source: src({ category: 'auto' }) });
  assert.ok(c.flags.recall && c.categories.includes('recalls'));
  const d = classify({ title: 'PlayStation 5 Pro drops to lowest price ever: $100 off', summary: '', source: src({ category: 'gaming' }) });
  assert.ok(d.flags.deal);
  const t = classify({ title: 'US and China reach trade deal', summary: '', source: src() });
  assert.ok(!t.flags.deal);
  const p = classify({ title: 'Apple unveils iPhone 18 Pro', summary: '', source: src({ category: 'tech' }) });
  assert.ok(p.flags.product && p.brands.includes('Apple'));
});

// ---------- lifecycle ----------
test('lifecycle: NEW → duplicate merge → ONGOING next day → UPDATED with what changed', () => {
  const state = emptyState();
  const now = Date.now();
  const bing = parseXmlFeed(fx.bingDupage(), { type: 'bing' });
  const s1 = ingest(state, bing, src({ id: 'bing-dupage', category: 'dupage', type: 'bing' }), now);
  assert.equal(s1.added, 2, 'Naperville (verified) + Aurora (nearby)');
  assert.equal(s1.rejected, 2, 'Wheaton MD + highway-only');
  assert.equal(s1.stale, 1);

  // Google reports the same Naperville crash → merged, not duplicated
  const g = parseXmlFeed(fx.googleDupage(), { type: 'google' });
  const s2 = ingest(state, g, src({ id: 'gnews-dupage', category: 'dupage', type: 'google' }), now);
  assert.equal(s2.duplicates, 1);
  assert.equal(s2.added, 1, 'Glen Ellyn fire');
  const crash = Object.values(state.stories).find((s) => s.title.startsWith('Semi-truck'));
  assert.equal(crash.alsoReportedBy.length, 0, 'same publisher domain is not "also reported"');

  const fresh = present(crash, now);
  assert.ok(['NEW', 'BREAKING'].includes(fresh.status));

  // Same feed next day, nothing changed → ONGOING
  crash.firstDiscoveredAt = new Date(now - 30 * 3600e3).toISOString();
  crash.publishedAt = new Date(now - 30 * 3600e3).toISOString();
  ingest(state, bing, src({ id: 'bing-dupage', category: 'dupage', type: 'bing' }), now);
  assert.equal(computeStatus(crash, now), 'ONGOING');

  // Source updates the story text → UPDATED with a diff
  const changed = parseXmlFeed(fx.bingDupage(), { type: 'bing' });
  changed[0].summary = 'All westbound lanes of I-88 in Naperville have reopened after the truck was removed; one driver was hospitalized.';
  const s3 = ingest(state, changed, src({ id: 'bing-dupage', category: 'dupage', type: 'bing' }), now);
  assert.equal(s3.changed, 1);
  assert.equal(computeStatus(crash, now), 'UPDATED');
  assert.match(crash.changes[0].summary.to, /reopened/);
});

test('NWS update message updates the same story instead of duplicating', () => {
  const state = emptyState();
  const nws = src({ id: 'nws-dupage', category: 'dupage', type: 'nws', official: true });
  ingest(state, parseNwsAlerts(fx.nwsDupage()), nws);
  const r = ingest(state, parseNwsAlerts(fx.nwsDupage({ updated: true })), nws);
  assert.equal(Object.keys(state.stories).length, 1);
  assert.equal(r.changed, 1);
  const s = Object.values(state.stories)[0];
  assert.equal(s.location.status, 'confirmed');
});

test('queries: views + For You + search', () => {
  const state = emptyState();
  ingest(state, parseXmlFeed(fx.techRss(), { type: 'rss' }), src({ id: 'tech', category: 'tech' }));
  ingest(state, parseXmlFeed(fx.bingDupage(), { type: 'bing' }), src({ id: 'bd', category: 'dupage', type: 'bing' }));
  assert.equal(queryStories(state, { view: 'recalls' }).total, 1);
  assert.equal(queryStories(state, { view: 'deals' }).total, 1);
  assert.ok(queryStories(state, { view: 'products' }).stories.some((s) => s.title.includes('iPhone')));
  assert.equal(queryStories(state, { view: 'foryou', brands: 'monster' }).stories[0].brands[0], 'Monster');
  assert.equal(queryStories(state, { view: 'dupage' }).stories.every((s) => ['confirmed', 'verified'].includes(s.location.status)), true);
  const dupageAll = queryStories(state, { view: 'dupage' }).stories.map((s) => s.title);
  assert.ok(dupageAll.some((t) => t.includes('7 Brew')), 'brand story in Naperville shows on DuPage radar');
  assert.ok(!dupageAll.some((t) => t.includes('Aurora')), 'nearby hidden by default');
  assert.ok(queryStories(state, { view: 'dupage', includeNearby: true }).stories.some((s) => s.title.includes('Aurora')));
  assert.equal(queryStories(state, { q: 'iphone camera' }).total, 1);
  const openings = queryStories(state, { view: 'openings' }).stories.map((s) => s.title);
  assert.ok(openings.some((t) => t.includes('closing')) && openings.some((t) => t.includes('grand opening')));
});

test('local incident covered by several outlets merges into one story', () => {
  const state = emptyState();
  const now = Date.now();
  const mk = (title, link, publisher, h) => ({ title, link, summary: '', publisher, publishedAt: new Date(now - h * 3600e3).toISOString() });
  const items = [
    mk('Oakbrook Center Shooting in Oak Brook, Illinois', 'https://hoodline.com/a', 'Hoodline', 1),
    mk('Shooting Reported At Oakbrook Center: Police', 'https://patch.com/illinois/elmhurst/a', 'Patch', 1.2),
    mk('Police respond to shooting at Oakbrook Center', 'https://www.dailyherald.com/a', 'Daily Herald', 0.8),
    mk('Oak Brook police investigate burglary at car dealership', 'https://www.dailyherald.com/b', 'Daily Herald', 0.5),
  ];
  const r = ingest(state, items, src({ id: 'd', category: 'dupage' }), now);
  assert.equal(r.added, 2, 'shooting (merged) + separate burglary');
  assert.equal(r.duplicates, 2);
  const shooting = Object.values(state.stories).find((s) => /Oakbrook Center/.test(s.title));
  assert.equal(shooting.alsoReportedBy.length, 2);
});

test('product + recall details, extra badges', async () => {
  const { productDetails, recallDetails, detectFlags } = await import('../src/classify.js');
  const p = productDetails('Celsius launches new Blue Razz Lemonade flavor', 'The 12 fl oz cans are available nationwide starting Oct. 6 for $2.49.');
  assert.equal(p.price, '$2.49');
  assert.equal(p.variant, 'Blue Razz Lemonade');
  assert.equal(p.size, '12 fl oz');
  assert.match(p.availability, /available nationwide/);
  const r = recallDetails('ZCK01 Recalls Kesyup Mattresses Due to Risk of Serious Injury or Death from Fire Hazard', 'The mattresses were sold at Amazon.com from June 2025 through August 2026.', { sourceId: 'cpsc-recalls' });
  assert.equal(r.product, 'Kesyup Mattresses');
  assert.match(r.reason, /Fire Hazard/);
  assert.match(r.affected, /sold at Amazon/);
  assert.match(r.action, /Stop using/);
  const f = recallDetails('Sierra Nevada Cheese Company Recalls Graziers Raw Milk Cheese Because of Possible Health Risk', '', { sourceId: 'fda-recalls' });
  assert.equal(f.product, 'Graziers Raw Milk Cheese');
  assert.match(f.action, /Don't eat/);
  assert.ok(detectFlags('McDonald\'s is discontinuing the Snack Wrap again', 'food').discontinued);
  assert.ok(detectFlags('Nike Air Max limited-edition drop', 'clothing').limited);
  assert.ok(detectFlags('iPhone 18 design leaked in new renders', 'tech').leak);
  assert.ok(detectFlags('Apple reportedly planning foldable iPhone', 'tech').rumor);
});

test('US-only filter', async () => {
  const { isForeignOnly } = await import('../src/usfilter.js');
  assert.ok(isForeignOnly('Russia launches largest attack on Ukraine energy grid', '', 'news'));
  assert.ok(!isForeignOnly('U.S. withdraws forces in Iraq', '', 'news'));
  assert.ok(!isForeignOnly('Naperville police investigate crash', '', 'dupage'));
  assert.ok(!isForeignOnly('New Apple TV comedy gets perfect score', 'Starring a British actor.', 'tech'), 'brand story: only headline counts');
  assert.ok(isForeignOnly('Starbucks Japan unveils new Pumpkin drink', '', 'food'));
});

test('lion briefing: clean, funny on fun stuff, serious on emergencies, NFL stats spoken', async () => {
  const { buildBriefing } = await import('../src/briefing.js');
  const now = Date.now();
  const mk = (o) => ({ id: Math.random().toString(36).slice(2), status: 'NEW', tags: [], brands: [], categories: [o.category], score: 50, publishedAt: new Date(now - 3600e3).toISOString(), summary: '', sourceName: 'Test', ...o });
  const stories = [
    mk({ title: 'Wheaton police investigate crash on Roosevelt Road', category: 'dupage', location: { status: 'verified', places: ['Wheaton'], incident: { id: 'crash', label: 'Crash' } } }),
    mk({ title: 'Celsius launches new Blue Razz flavor', category: 'energy', tags: ['LAUNCH'], brands: ['Celsius'] }),
    mk({ title: 'Target cuts prices on 3,000 items', category: 'deals', tags: ['DEAL'], brands: ['Target'] }),
  ];
  const nfl = { games: [{ id: 'g1', state: 'post', date: new Date(now - 864e5).toISOString(), detail: 'Final', home: { name: 'Bears', abbr: 'CHI', score: '27' }, away: { name: 'Packers', abbr: 'GB', score: '20' }, leaders: [{ player: 'QB One', value: '24/31, 288 YDS, 2 TD' }] }] };
  const b = buildBriefing(stories, now, { nfl });
  const crash = b.segments.find((s) => /crash/i.test(s.text));
  const drink = b.segments.find((s) => /Celsius/.test(s.text));
  const game = b.segments.find((s) => s.kind === 'nfl');
  assert.ok(crash.serious);
  assert.ok(!drink.serious);
  assert.notEqual(drink.text, `${drink.text.split('.')[0]}.`);
  assert.match(game.text, /Bears beat the Packers, 27 to 20/);
  assert.match(game.text, /24 of 31, 288 yards, 2 touchdowns/);
  assert.match(game.text, /Top stat line: QB One/);
  assert.doesNotMatch(b.script, /\b(damn|hell|crap|shit|fuck)\b/i);
  assert.equal(b.segments[0].kind, 'intro');
  assert.equal(b.segments.at(-1).kind, 'outro');
});
