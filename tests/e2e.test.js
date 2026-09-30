// End-to-end: boots the real server against a local fixture feed server, runs refreshes through the API.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import * as fx from './fixtures.js';

const ROOT = path.resolve(import.meta.dirname, '..');
let feedPort;
let appPort;
let child;
let changed = false;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'smash-e2e-'));

function startFeeds() {
  const srv = http.createServer((req, res) => {
    const u = req.url;
    const xml = (b) => { res.writeHead(200, { 'content-type': 'application/rss+xml' }); res.end(b); };
    if (u === '/bing-dupage.xml') {
      let body = fx.bingDupage();
      if (changed) body = body.replace('forced the temporary closure of westbound lanes.', 'All westbound lanes have reopened; the driver was taken to Edward Hospital.');
      return xml(body);
    }
    if (u === '/google-dupage.xml') return xml(fx.googleDupage());
    if (u === '/patch-wheaton.xml') return xml(fx.patchWheaton());
    if (u === '/tech.xml') return xml(fx.techRss());
    if (u === '/xbox.atom') return xml(fx.atomFeed());
    if (u === '/nws.json') { res.writeHead(200, { 'content-type': 'application/geo+json' }); return res.end(fx.nwsDupage({ updated: changed })); }
    if (u === '/local.xml') return xml(`<?xml version="1.0"?><rss version="2.0"><channel><title>x</title><item><title>Lombard, Illinois opens new splash pad at Four Seasons Park</title><link>http://127.0.0.1:${feedPort}/article/1</link><description>Short.</description><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`);
    if (u === '/article/1') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(fx.articleHtml(`http://127.0.0.1:${feedPort}/img/splash.jpg`)); }
    if (u === '/broken.xml') { res.writeHead(500); return res.end('nope'); }
    if (u === '/notfeed.xml') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<html>not a feed</html>'); }
    res.writeHead(404); res.end();
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => { feedPort = srv.address().port; r(srv); }));
}

const get = async (p) => { const r = await fetch(`http://127.0.0.1:${appPort}${p}`); return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text(), headers: r.headers }; };
const send = async (method, p, body) => { const r = await fetch(`http://127.0.0.1:${appPort}${p}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) }); return { status: r.status, body: await r.json() }; };

let feedSrv;
test.before(async () => {
  feedSrv = await startFeeds();
  const base = `http://127.0.0.1:${feedPort}`;
  const sources = [
    { id: 'bing-dupage', name: 'Bing News: dupage', url: `${base}/bing-dupage.xml`, type: 'bing', category: 'dupage', tier: 'fast', reliability: 3 },
    { id: 'gnews-dupage', name: 'Google News: dupage', url: `${base}/google-dupage.xml`, type: 'google', category: 'dupage', tier: 'fast', reliability: 3 },
    { id: 'patch-wheaton', name: 'Patch — Wheaton', url: `${base}/patch-wheaton.xml`, type: 'rss', category: 'dupage', tier: 'fast', reliability: 4 },
    { id: 'nws-dupage', name: 'NWS DuPage', url: `${base}/nws.json`, type: 'nws', category: 'dupage', tier: 'fast', official: true, reliability: 5 },
    { id: 'tech', name: 'Tech Feed', url: `${base}/tech.xml`, type: 'rss', category: 'tech', tier: 'normal', reliability: 4 },
    { id: 'xbox-wire', name: 'Xbox Wire', url: `${base}/xbox.atom`, type: 'rss', category: 'gaming', tier: 'normal', official: true, reliability: 5 },
    { id: 'local', name: 'Local', url: `${base}/local.xml`, type: 'rss', category: 'dupage', tier: 'fast', reliability: 4 },
    { id: 'broken', name: 'Broken Feed', url: `${base}/broken.xml`, type: 'rss', category: 'news', tier: 'fast', reliability: 3 },
    { id: 'notfeed', name: 'Not A Feed', url: `${base}/notfeed.xml`, type: 'rss', category: 'news', tier: 'fast', reliability: 3 },
  ];
  fs.writeFileSync(path.join(tmp, 'sources.json'), JSON.stringify(sources));
  appPort = 18000 + Math.floor(Math.random() * 2000);
  child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(appPort), HOST: '127.0.0.1', DATABASE_PATH: path.join(tmp, 'db.json'), SOURCES_FILE: path.join(tmp, 'sources.json'), AUTO_REFRESH: 'off', ANTHROPIC_API_KEY: '', HTTPS_PROXY: '', HTTP_PROXY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  for (let i = 0; i < 50; i++) {
    try { if ((await get('/api/health')).status === 200) return; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`server did not start:\n${log}`);
});
test.after(() => { child?.kill(); feedSrv?.close(); });

test('static shell + PWA files', async () => {
  const index = await get('/');
  assert.equal(index.status, 200);
  assert.match(index.body, /apple-mobile-web-app-capable/);
  assert.match(index.body, /apple-touch-icon/);
  const man = await get('/manifest.webmanifest');
  assert.equal(man.headers.get('content-type'), 'application/manifest+json');
  assert.equal((typeof man.body === 'string' ? JSON.parse(man.body) : man.body).display, 'standalone');
  assert.equal((await get('/sw.js')).status, 200);
  assert.equal((await get('/icons/apple-touch-icon.png')).status, 200);
  assert.equal((await get('/icons/icon-512.png')).status, 200);
  assert.equal((await get('/some/deep/route')).status, 200, 'SPA fallback');
  assert.equal((await get('/nope.js')).status, 404);
  assert.equal((await get('/../server.js')).status !== 200 || !(await get('/../server.js')).body.includes('createServer'), true);
});

test('before first sweep: empty but healthy', async () => {
  const m = await get('/api/meta');
  assert.equal(m.body.lastRefreshAt, null);
  assert.equal(m.body.sourceSummary.total, 9);
});

test('full sweep via API: collects, verifies, dedupes, reports health', async () => {
  const r = await send('POST', '/api/refresh?wait=1', { force: true });
  assert.equal(r.status, 200);
  const run = r.body.run;
  assert.equal(run.sourcesChecked, 9);
  assert.equal(run.ok, 7);
  assert.equal(run.failed, 2);
  assert.ok(run.added >= 12, `added ${run.added}`);
  assert.ok(run.duplicates >= 1, 'Google copy of Naperville crash merged');
  assert.ok(run.rejected >= 3, 'Wheaton MD, highway-only, regional Patch rejected');

  const all = (await get('/api/stories?view=all&limit=200')).body;
  const titles = all.stories.map((s) => s.title);
  assert.equal(titles.filter((t) => t.startsWith('Semi-truck')).length, 1, 'no duplicate');
  assert.ok(!titles.some((t) => t.includes('Wheaton Plaza')));
  assert.ok(!titles.some((t) => t.includes('shuts lanes on I-88')));
  for (const s of all.stories) {
    for (const k of ['id', 'title', 'category', 'status', 'url', 'sourceName', 'discoveredAt', 'whyItMatters']) assert.ok(s[k], `${k} missing on ${s.title}`);
    assert.ok(['BREAKING', 'NEW', 'UPDATED', 'ONGOING', 'EARLIER'].includes(s.status));
  }

  const dup = (await get('/api/stories?view=dupage')).body.stories;
  assert.ok(dup.length >= 5);
  assert.ok(dup.every((s) => ['confirmed', 'verified'].includes(s.location.status)));
  assert.ok(dup.some((s) => s.tags.includes('ALERT')), 'NWS alert present');

  const sources = (await get('/api/sources')).body.sources;
  const broken = sources.find((s) => s.id === 'broken');
  assert.equal(broken.lastStatus, 'error');
  assert.match(broken.lastError, /HTTP 500/);
  assert.match(sources.find((s) => s.id === 'notfeed').lastError, /not an RSS/);
  assert.equal(sources.find((s) => s.id === 'tech').lastStatus, 'ok');

  const dmeta = (await get('/api/dupage')).body;
  assert.ok(dmeta.rejected.some((x) => /highway/.test(x.reason)));
});

test('enrichment pulls og:image + better summary from the article page', async () => {
  const s = (await get('/api/stories?q=splash')).body.stories[0];
  assert.ok(s, 'splash pad story present');
  assert.match(s.imageUrl, /splash\.jpg$/);
  assert.match(s.summary, /Full article description/);
});

test('second sweep: unchanged → no new; changed → UPDATED with What Changed', async () => {
  const again = (await send('POST', '/api/refresh?wait=1', { force: true })).body.run;
  assert.equal(again.added, 0, 'nothing new on identical feeds');
  assert.equal(again.changed, 0);

  changed = true;
  const third = (await send('POST', '/api/refresh?wait=1', { force: true })).body.run;
  assert.equal(third.added, 0);
  assert.equal(third.changed, 2, 'crash story + NWS alert update');
  const crash = (await get('/api/stories?q=semi-truck')).body.stories[0];
  assert.ok(['UPDATED', 'BREAKING'].includes(crash.status), crash.status);
  assert.ok(crash.lastChangedAt);
  assert.match(crash.changes[0].summary.to, /reopened/);
  const detail = (await get(`/api/stories/${crash.id}`)).body;
  assert.equal(detail.id, crash.id);
});

test('views + filters', async () => {
  for (const v of ['home', 'breaking', 'today', 'week', 'dupage', 'products', 'deals', 'recalls', 'openings', 'foryou']) {
    assert.equal((await get(`/api/stories?view=${v}&brands=apple,monster`)).status, 200);
  }
  assert.equal((await get('/api/stories?view=recalls')).body.stories[0].tags.includes('RECALL'), true);
  assert.ok((await get('/api/stories?view=foryou&brands=apple')).body.stories.every((s) => s.brandIds.includes('apple')));
  assert.ok((await get('/api/stories?view=dupage&incident=crash')).body.stories.every((s) => s.location.incident.id === 'crash'));
  assert.equal((await get('/api/stories/doesnotexist')).status, 404);
});

test('source management: disable + custom feed', async () => {
  assert.equal((await send('PATCH', '/api/sources/broken', { enabled: false })).status, 200);
  const s = (await get('/api/sources')).body.sources.find((x) => x.id === 'broken');
  assert.equal(s.enabled, false);
  const add = await send('POST', '/api/sources', { name: 'Naperville PD', url: `http://127.0.0.1:${feedPort}/local.xml`, category: 'dupage' });
  assert.equal(add.status, 201);
  assert.equal((await send('POST', '/api/sources', { name: 'bad', url: 'ftp://x' })).status, 400);
  const run = (await send('POST', '/api/refresh?wait=1', { force: true })).body.run;
  assert.equal(run.sourcesChecked, 9, '8 remaining built-ins + 1 custom');
});

test('persistence: data file written', () => {
  const db = JSON.parse(fs.readFileSync(path.join(tmp, 'db.json'), 'utf8'));
  assert.ok(Object.keys(db.stories).length > 10);
  assert.ok(db.runs.length >= 3);
});
