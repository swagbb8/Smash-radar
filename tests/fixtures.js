// TEST-ONLY feed fixtures (shaped like the real Bing/Google/Patch/NWS responses).
// These never ship to the app — they are served by a local test server to exercise the pipeline.
const ago = (h) => new Date(Date.now() - h * 3600e3).toUTCString();
const agoIso = (h) => new Date(Date.now() - h * 3600e3).toISOString();

export function bingDupage(extra = []) {
  const items = [
    ['Semi-truck causes I-88 crash in Naperville after striking railroad bridge', 'https://www.chicagotribune.com/2026/09/30/truck-railroad-bridge-naperville-collision/', 'A crash involving a truck striking an Interstate 88 railroad bridge in Naperville forced the temporary closure of westbound lanes.', 'Chicago Tribune', 1, 'http://www.bing.com/th?id=OVFT.abc&pid=News'],
    ['Police investigate shooting near Wheaton Plaza', 'https://www.wusa9.com/article/news/wheaton-plaza-shooting/', 'Montgomery County police in Wheaton, Maryland responded to a shooting Tuesday night.', 'WUSA9', 2, null],
    ['Multi-vehicle crash shuts lanes on I-88', 'https://www.examplenews.com/i88-crash-lanes', 'State police say several vehicles collided on I-88 near the toll plaza during the evening commute.', 'Example News', 1.5, null],
    ['Aurora police respond to crash on Route 59', 'https://www.examplenews.com/aurora-route-59-crash', 'Aurora police responded to a two-car crash on Route 59 in Aurora, Illinois on Tuesday.', 'Example News', 3, null],
    ['Old story from last month in Lombard', 'https://www.dailyherald.com/old-lombard', 'Lombard news', 'Daily Herald', 24 * 20, null],
    ...extra,
  ];
  return rss(items.map(([t, url, d, src, h, img]) => `<item><title>${esc(t)}</title><link>http://www.bing.com/news/apiclick.aspx?ref=FexRss&amp;aid=&amp;tid=x&amp;url=${encodeURIComponent(url)}&amp;c=1&amp;mkt=en-us</link><description>${esc(d)}</description><pubDate>${ago(h)}</pubDate><News:Source>${esc(src)}</News:Source>${img ? `<News:Image>${esc(img)}</News:Image>` : ''}</item>`), 'xmlns:News="https://www.bing.com/news/search?q=x&amp;format=rss"');
}

export function googleDupage() {
  return rss([
    `<item><title>Semi-truck causes I-88 crash in Naperville after striking railroad bridge - Chicago Tribune</title><link>https://news.google.com/rss/articles/CBMiTESTID?oc=5</link><guid isPermaLink="false">CBMiTESTID</guid><pubDate>${ago(1)}</pubDate><description>&lt;a href="https://news.google.com/rss/articles/CBMiTESTID?oc=5"&gt;Semi-truck causes I-88 crash in Naperville after striking railroad bridge&lt;/a&gt;&amp;nbsp;&amp;nbsp;&lt;font color="#6f6f6f"&gt;Chicago Tribune&lt;/font&gt;</description><source url="https://www.chicagotribune.com">Chicago Tribune</source></item>`,
    `<item><title>Glen Ellyn fire crews battle house fire on Crescent Blvd - Daily Herald</title><link>https://news.google.com/rss/articles/CBMiGLENFIRE?oc=5</link><guid isPermaLink="false">CBMiGLENFIRE</guid><pubDate>${ago(0.5)}</pubDate><description>x</description><source url="https://www.dailyherald.com">Daily Herald</source></item>`,
  ]);
}

export function patchWheaton() {
  return rss([
    `<item><title><![CDATA[Cider And Ale Festival Returns To Morton Arboretum]]></title><link><![CDATA[http://patch.com/illinois/wheaton/cider-ale-festival-returns-morton-arboretum?utm_source=article-mostrecent&utm_medium=rss]]></link><description><![CDATA[The popular fall festival returns this weekend.]]></description><pubDate>${ago(5)}</pubDate><guid isPermaLink="false">http://patch.com/illinois/wheaton/cider-ale-festival</guid><media:thumbnail url="https://patch.com/img/cdn20/test/cider.jpg" width="400"/><geo:Point><geo:lat>41.8661</geo:lat><geo:long>-88.107</geo:long></geo:Point></item>`,
    `<item><title><![CDATA[Repeated Downpours Could Lead To Flooding For Chicago Area]]></title><link><![CDATA[http://patch.com/illinois/across-il/repeated-downpours-flooding]]></link><description><![CDATA[Forecasters say storms could bring flooding.]]></description><pubDate>${ago(2)}</pubDate><media:thumbnail url="https://patch.com/img/cdn20/test/rain.jpg" width="400"/></item>`,
  ], 'xmlns:media="http://search.yahoo.com/mrss/" xmlns:geo="http://www.w3.org/2003/01/geo/wgs84_pos#"');
}

export function nwsDupage({ updated = false } = {}) {
  const base = {
    id: updated ? 'urn:oid:alert.2' : 'urn:oid:alert.1', status: 'Actual', messageType: updated ? 'Update' : 'Alert',
    event: 'Flood Advisory', severity: 'Minor', urgency: 'Expected', areaDesc: 'DuPage, IL; Cook, IL', senderName: 'NWS Chicago IL',
    headline: 'Flood Advisory issued for DuPage County', description: updated ? 'Flooding of low-lying areas continues. Rain totals up to 3 inches.' : 'Minor flooding of low-lying and poor drainage areas.',
    instruction: 'Turn around, don\'t drown.', sent: agoIso(updated ? 0.2 : 1), effective: agoIso(1), ends: new Date(Date.now() + 5 * 3600e3).toISOString(),
    references: updated ? [{ identifier: 'urn:oid:alert.1' }] : [],
  };
  return JSON.stringify({ type: 'FeatureCollection', features: [{ properties: base }] });
}

export function techRss() {
  return rss([
    ['Apple unveils iPhone 18 Pro with new camera system', 'https://www.theverge.com/apple-iphone-18-pro', 'Apple today announced the iPhone 18 Pro, available for pre-order Friday.', 1, 'https://cdn.example.com/iphone.jpg'],
    ['Monster Energy launches new Ultra flavor for fall', 'https://www.bevnet.com/monster-ultra-fall', 'Monster Beverage is rolling out a new Ultra flavor drink nationwide.', 2, null],
    ['Ford recalls 200,000 F-150 trucks over brake issue', 'https://www.example.com/ford-recall-f150', 'Ford Motor is recalling F-150 pickup trucks, NHTSA said.', 3, null],
    ['PlayStation 5 Pro drops to lowest price ever: $100 off', 'https://www.example.com/ps5-deal', 'Sony PlayStation 5 Pro is on sale at Best Buy and Target for $100 off.', 4, null],
    ['Target is closing 12 stores next month', 'https://www.example.com/target-closing', 'The retailer Target is closing its stores in several cities.', 5, null],
    ['7 Brew grand opening set for Naperville on Route 59', 'https://www.example.com/7brew-naperville', 'The drive-thru coffee chain 7 Brew will hold a grand opening in Naperville, Illinois.', 6, null],
    ['It was 30 degrees Celsius in Paris as Harrison Ford visited', 'https://www.example.com/paris-heat', 'Temperatures hit 30 degrees Celsius.', 2, null],
  ].map(([t, url, d, h, img]) => `<item><title>${esc(t)}</title><link>${url}</link><description>${esc(d)}</description><pubDate>${ago(h)}</pubDate>${img ? `<media:content url="${img}" medium="image" width="1200"/>` : ''}</item>`), 'xmlns:media="http://search.yahoo.com/mrss/"');
}

export function atomFeed() {
  return `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Xbox Wire</title>
  <entry><title>Game Pass adds five new games this week</title><link rel="alternate" href="https://news.xbox.com/en-us/game-pass-new-games/"/><id>tag:xbox,1</id><published>${agoIso(3)}</published><updated>${agoIso(3)}</updated><summary>Xbox Game Pass members can play five new titles starting today, including a surprise release.</summary></entry></feed>`;
}

export function articleHtml(img = 'https://cdn.example.com/og-image.jpg') {
  return `<!doctype html><html><head><meta property="og:image" content="${img}"><meta property="og:description" content="Full article description from the publisher page with more detail than the feed provided."><link rel="canonical" href="https://www.example.com/canonical"></head><body>hi</body></html>`;
}

function rss(items, ns = '') {
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" ${ns}><channel><title>t</title><link>https://x</link><description>d</description>${items.join('')}</channel></rss>`;
}
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
