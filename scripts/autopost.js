// SMASH NEWS auto-poster (Instagram Graph API). Runs inside the GitHub Action.
//   node scripts/autopost.js plan     → decide what to post now (writes data/autopost-plan.json)
//   node scripts/autopost.js render   → render planned posts to dist/posts/*.jpg (needs Playwright)
//   node scripts/autopost.js publish  → wait for the images to be live on GitHub Pages, then post them
// Disabled unless IG_USER_ID and IG_ACCESS_TOKEN are set (GitHub repo secrets).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.resolve(ROOT, process.env.DATABASE_PATH ? path.dirname(process.env.DATABASE_PATH) : 'data');
const DIST = path.resolve(ROOT, process.env.STATIC_OUT || 'dist');
const PLAN = path.join(DATA, 'autopost-plan.json');
const LOG = path.join(DATA, 'autopost-log.json');
const env = (k, d) => (process.env[k] === undefined || process.env[k] === '' ? d : process.env[k]);

const CFG = {
  userId: env('IG_USER_ID'),
  token: env('IG_ACCESS_TOKEN'),
  // Instagram-Login tokens (start with "IG") use graph.instagram.com; Facebook-Login tokens ("EAA…") use graph.facebook.com.
  host: env('IG_API_HOST', /^IG/.test(env('IG_ACCESS_TOKEN', '')) ? 'https://graph.instagram.com/v21.0' : 'https://graph.facebook.com/v21.0'),
  siteUrl: env('SITE_URL', ''), // e.g. https://swagbb8.github.io/Smash-radar/
  maxPerDay: Number(env('AUTOPOST_MAX_PER_DAY', 12)),
  minGapMin: Number(env('AUTOPOST_MIN_GAP_MINUTES', 45)),
  quiet: env('AUTOPOST_QUIET_HOURS', '23-7'), // no non-urgent posts overnight (Central)
  recapHour: Number(env('AUTOPOST_RECAP_HOUR', 19)), // 7 PM Central
  recap: env('AUTOPOST_RECAP', 'on') !== 'off',
  weekly: env('AUTOPOST_WEEKLY', 'on') !== 'off',
  weeklyDay: env('AUTOPOST_WEEKLY_DAY', 'Sun'), // Sun, Mon, …
  weeklyHour: Number(env('AUTOPOST_WEEKLY_HOUR', 18)),
  singles: env('AUTOPOST_SINGLES', 'on') !== 'off',
  photos: env('AUTOPOST_PHOTOS', 'off') === 'on', // publisher photos are copyrighted — off by default
  format: env('AUTOPOST_FORMAT', 'feed'),
  dryRun: env('AUTOPOST_DRY_RUN', 'off') === 'on',
};
const TZ = 'America/Chicago';
const dayKey = (d = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));
const hourNow = () => Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).format(new Date()));
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 1)); };
const out = (k, v) => { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); };

const URGENT = new Set(['fire', 'crash', 'police', 'emergency', 'missing', 'weather', 'flooding', 'closure', 'metra', 'trees', 'outage']);

function plan() {
  const enabled = !!(CFG.userId && CFG.token) || !!process.env.POSTIZ_API_KEY;
  const log = readJson(LOG, { posts: [] });
  const today = dayKey();
  const todays = log.posts.filter((p) => p.day === today);
  const stories = readJson(path.join(DIST, 'api', 'stories.json'), { stories: [] }).stories;
  const planned = [];
  if (!enabled) {
    console.log('autopost: disabled (set POSTIZ_API_KEY, or IG_USER_ID + IG_ACCESS_TOKEN, as repo secrets to turn it on)');
    writeJson(PLAN, { enabled: false, posts: [] });
    out('has_posts', 'false');
    return;
  }
  const posted = new Set(log.posts.flatMap((p) => p.storyIds || []));
  const last = log.posts.at(-1);
  const gapOk = !last || Date.now() - Date.parse(last.at) > CFG.minGapMin * 60e3;

  // Daily recap carousel
  if (CFG.recap && hourNow() >= CFG.recapHour && !todays.some((p) => p.kind === 'recap')) {
    const pool = stories.filter((s) => !s.tags.includes('RUMOR') && !s.tags.includes('LEAK') && (dayKey(s.publishedAt || s.discoveredAt) === today || ['NEW', 'BREAKING', 'UPDATED'].includes(s.status)));
    const picks = [];
    const cats = new Set();
    for (const s of pool.slice().sort((a, b) => b.score - a.score)) { if (picks.length < 5 && !cats.has(s.category)) { picks.push(s); cats.add(s.category); } }
    for (const s of pool) { if (picks.length >= 5) break; if (!picks.includes(s)) picks.push(s); }
    if (picks.length >= 3) planned.push({ kind: 'recap', storyIds: picks.map((s) => s.id) });
  }
  // Weekly recap carousel (default Sunday 6 PM)
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(new Date());
  const lastWeekly = log.posts.filter((p) => p.kind === 'weekly').at(-1);
  if (CFG.weekly && !planned.length && weekday === CFG.weeklyDay && hourNow() >= CFG.weeklyHour && (!lastWeekly || Date.now() - Date.parse(lastWeekly.at) > 5 * 864e5)) {
    const weekAgo = Date.now() - 7 * 864e5;
    const pool = stories.filter((s) => Date.parse(s.publishedAt || s.discoveredAt) > weekAgo && !s.tags.includes('RUMOR') && !s.tags.includes('LEAK'));
    const big = (x) => (x.alsoReportedBy?.length || 0) * 10 + (x.tags.includes('TRENDING') ? 20 : 0) + (x.status === 'BREAKING' ? 15 : 0) + (x.tags.includes('RECALL') ? 8 : 0) + (x.tags.includes('LAUNCH') ? 6 : 0) + (x.official ? 5 : 0) + (x.location && ['confirmed', 'verified'].includes(x.location.status) ? 8 : 0) + x.score / 20;
    const ranked = pool.slice().sort((a, b) => big(b) - big(a));
    const picks = []; const cats = new Set();
    for (const x of ranked) { if (picks.length < 9 && !cats.has(x.category)) { picks.push(x); cats.add(x.category); } }
    for (const x of ranked) { if (picks.length >= 9) break; if (!picks.includes(x)) picks.push(x); }
    if (picks.length >= 3) planned.push({ kind: 'weekly', storyIds: picks.map((x) => x.id) });
  }
  // Single posts: real breaking news + verified, urgent DuPage incidents
  const singlesToday = todays.filter((p) => p.kind === 'single').length;
  if (CFG.singles && gapOk && singlesToday < CFG.maxPerDay && !planned.length) {
    const age = (s) => Date.now() - Date.parse(s.publishedAt || s.discoveredAt);
    const clean = (s) => !posted.has(s.id) && !s.tags.includes('RUMOR') && !s.tags.includes('LEAK');
    const isLocal = (s) => s.location && ['confirmed', 'verified'].includes(s.location.status);
    const [qs, qe] = CFG.quiet.split('-').map(Number);
    const h = hourNow();
    const quiet = Number.isFinite(qs) && (qs > qe ? h >= qs || h < qe : h >= qs && h < qe);
    const byScore = (a, b) => b.score - a.score;
    // Priority tiers — urgent news can post any time; everything else waits for daytime.
    const tiers = [
      [true, (s) => isLocal(s) && URGENT.has(s.location.incident?.id) && age(s) < 3 * 3600e3],
      [true, (s) => s.status === 'BREAKING' && age(s) < 3 * 3600e3],
      [false, (s) => s.tags.includes('RECALL') && age(s) < 12 * 3600e3],
      [false, (s) => s.tags.includes('TRENDING') && age(s) < 8 * 3600e3],
      [false, (s) => (s.tags.includes('LAUNCH') || s.tags.includes('LIMITED') || s.tags.includes('DISCONTINUED')) && s.brands.length && age(s) < 8 * 3600e3],
      [false, (s) => s.tags.includes('DEAL') && s.brands.length && age(s) < 8 * 3600e3],
      [false, (s) => isLocal(s) && age(s) < 12 * 3600e3],
      [false, (s) => ['NEW', 'UPDATED'].includes(s.status) && age(s) < 6 * 3600e3],
    ];
    let pick = null;
    for (const [urgent, fn] of tiers) {
      if (quiet && !urgent) continue;
      pick = stories.filter((s) => clean(s) && fn(s)).sort(byScore)[0];
      if (pick) break;
    }
    if (pick) planned.push({ kind: 'single', storyIds: [pick.id] });
  }
  writeJson(PLAN, { enabled: true, createdAt: new Date().toISOString(), posts: planned });
  console.log(`autopost: ${planned.length ? planned.map((p) => `${p.kind}(${p.storyIds.length})`).join(', ') : 'nothing to post right now'}`);
  out('has_posts', planned.length ? 'true' : 'false');
}

// Serve dist/ locally and let the app's own renderer (public/post.js) draw the posts in headless Chromium.
async function render() {
  const p = readJson(PLAN, { posts: [] });
  if (!p.posts.length) return console.log('render: nothing planned');
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const f = path.join(DIST, u === '/' ? 'index.html' : u);
    if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${base}index.html#/home`, { waitUntil: 'domcontentloaded' });
  const stories = readJson(path.join(DIST, 'api', 'stories.json'), { stories: [] }).stories;
  fs.mkdirSync(path.join(DIST, 'posts'), { recursive: true });
  const stamp = Date.now().toString(36);
  for (const post of p.posts) {
    const items = post.storyIds.map((id) => stories.find((s) => s.id === id)).filter(Boolean).map((s) => (CFG.photos ? s : { ...s, imageUrl: null }));
    const result = await page.evaluate(async ({ items, kind, format }) => {
      const m = await import('./post.js');
      const multi = kind === 'recap' || kind === 'weekly';
      const canv = multi
        ? [await m.renderRecapCover(items, format, kind === 'weekly' ? "THIS WEEK'S NEWS" : "TODAY'S NEWS", kind === 'weekly' ? m.weekRange() : null), ...(await Promise.all(items.map((s, i) => m.renderStoryPost(s, format, { slide: `${i + 2}/${items.length + 1}` }))))]
        : [await m.renderStoryPost(items[0], format)];
      return { images: canv.map((c) => c.toDataURL('image/jpeg', 0.92)), caption: multi ? m.recapCaption(items, kind === 'weekly') : m.captionFor(items[0]) };
    }, { items, kind: post.kind, format: CFG.format });
    post.files = result.images.map((d, i) => {
      const name = `${post.kind}-${stamp}-${i + 1}.jpg`;
      fs.writeFileSync(path.join(DIST, 'posts', name), Buffer.from(d.split(',')[1], 'base64'));
      return `posts/${name}`;
    });
    post.caption = result.caption.slice(0, 2150);
  }
  await browser.close();
  srv.close();
  writeJson(PLAN, p);
  console.log(`render: wrote ${p.posts.reduce((n, x) => n + x.files.length, 0)} image(s)`);
}

async function graph(pathname, params, method = 'POST') {
  const url = new URL(`${CFG.host}/${pathname}`);
  const body = new URLSearchParams({ ...params, access_token: CFG.token });
  const res = method === 'GET' ? await fetch(`${url}?${body}`) : await fetch(url, { method, body });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(`Instagram API ${pathname}: ${j.error?.message || res.status}`);
  return j;
}
async function waitReady(id) {
  for (let i = 0; i < 30; i++) {
    const j = await graph(id, { fields: 'status_code' }, 'GET');
    if (j.status_code === 'FINISHED') return;
    if (j.status_code === 'ERROR' || j.status_code === 'EXPIRED') throw new Error(`container ${id} ${j.status_code}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`container ${id} not ready`);
}
async function waitLive(url) {
  for (let i = 0; i < 60; i++) {
    const r = await fetch(url, { method: 'HEAD', cache: 'no-store' }).catch(() => null);
    if (r?.ok) return;
    await new Promise((res) => setTimeout(res, 5000));
  }
  throw new Error(`image never went live: ${url}`);
}

// Postiz: Instagram connected once inside Postiz (official login); we upload the rendered images and post through its CLI.
async function publishPostiz(p, log) {
  const { execFileSync } = await import('node:child_process');
  const pz = (...a) => execFileSync('postiz', a, { encoding: 'utf8', env: process.env, timeout: 120000 });
  try { execFileSync('postiz', ['--help'], { stdio: 'ignore' }); } catch { execFileSync('npm', ['i', '-g', '--silent', 'postiz'], { stdio: 'ignore' }); }
  const list = JSON.parse(pz('integrations:list'));
  const ig = (Array.isArray(list) ? list : list.output || []).filter((x) => /instagram/i.test(x.identifier || x.providerIdentifier || '') && !x.disabled);
  if (!ig.length) { console.log('publish: Postiz has no Instagram channel connected'); return; }
  for (const post of p.posts) {
    try {
      const media = post.files.slice(0, 10).map((f) => JSON.parse(pz('upload', path.join(DIST, f))).path);
      const when = new Date(Date.now() + 2 * 60e3).toISOString();
      const res = pz('posts:create', '-c', post.caption, '-m', media.join(','), '-s', when, '--settings', JSON.stringify({ post_type: 'post' }), '-i', ig.map((x) => x.id).join(','));
      log.posts.push({ at: new Date().toISOString(), day: dayKey(), kind: post.kind, storyIds: post.storyIds, via: 'postiz', result: res.slice(0, 200) });
      console.log(`publish (postiz): scheduled ${post.kind} with ${media.length} image(s)`);
    } catch (e) {
      log.errors = [{ at: new Date().toISOString(), kind: post.kind, error: `postiz: ${e.message}` }, ...(log.errors || [])].slice(0, 20);
      console.log(`publish (postiz): FAILED ${post.kind}: ${e.message}`);
    }
  }
}

async function publish() {
  const p = readJson(PLAN, { posts: [] });
  const log = readJson(LOG, { posts: [] });
  if (!p.posts.length) return console.log('publish: nothing planned');
  if (process.env.POSTIZ_API_KEY && !CFG.dryRun) { await publishPostiz(p, log); log.posts = log.posts.slice(-300); writeJson(LOG, log); return; }
  const site = CFG.siteUrl.replace(/\/?$/, '/');
  for (const post of p.posts) {
    const urls = post.files.map((f) => new URL(f, site).toString());
    try {
      if (CFG.dryRun) { console.log('DRY RUN', post.kind, urls); continue; }
      await waitLive(urls[0]);
      let creation;
      if (urls.length === 1) {
        creation = (await graph(`${CFG.userId}/media`, { image_url: urls[0], caption: post.caption })).id;
      } else {
        const children = [];
        for (const u of urls.slice(0, 10)) children.push((await graph(`${CFG.userId}/media`, { image_url: u, is_carousel_item: 'true' })).id);
        for (const c of children) await waitReady(c);
        creation = (await graph(`${CFG.userId}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption: post.caption })).id;
      }
      await waitReady(creation);
      const pub = await graph(`${CFG.userId}/media_publish`, { creation_id: creation });
      log.posts.push({ at: new Date().toISOString(), day: dayKey(), kind: post.kind, storyIds: post.storyIds, mediaId: pub.id });
      console.log(`publish: posted ${post.kind} → media ${pub.id}`);
    } catch (e) {
      log.errors = [{ at: new Date().toISOString(), kind: post.kind, error: e.message }, ...(log.errors || [])].slice(0, 20);
      console.log(`publish: FAILED ${post.kind}: ${e.message}`);
    }
  }
  log.posts = log.posts.slice(-300);
  writeJson(LOG, log);
}

const cmd = process.argv[2];
if (cmd === 'plan') plan();
else if (cmd === 'render') await render();
else if (cmd === 'publish') await publish();
else console.log('usage: node scripts/autopost.js plan|render|publish');
