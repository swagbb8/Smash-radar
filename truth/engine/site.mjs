// The public website: every file as a full article with its proof, a searchable library, subject pages, a briefing,
// a feed for email services, and the money slots Ash switches on from the studio (all off until he adds his IDs).
// Articles are assembled from the checked material only (claims, quotes, sources, the slides' own text): nothing new
// is written here, so nothing new can be wrong.
import fs from 'node:fs';
import path from 'node:path';
import { SUBJECTS } from './seeds.mjs';
import { clean, truncate } from './lib/text.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (/^https?:\/\/[^\s<>"']+$/i.test(String(u || '')) ? u : '');
const SERIES = { uncomfortable: 'The uncomfortable truth', hijacked: 'Your brain is being hijacked', unseen: 'The world you don’t see', darkside: 'The dark side of modern life', reality: 'Reality check', future: 'The future is closer than you think', think: 'Think about this' };
const KIND = { 'meta-analysis': 'Meta-analysis', 'systematic-review': 'Systematic review', rct: 'Randomized trial', trial: 'Clinical trial', experiment: 'Experiment', review: 'Review', observational: 'Observational study', preprint: 'Preprint, not peer reviewed', study: 'Study', data: 'Official data', encyclopedia: 'Background' };
const LEVEL = { established: ['Established', 3, 'Several studies combined, or official data'], supported: ['Supported', 2, 'At least one solid peer-reviewed study'], emerging: ['Emerging', 1, 'Early, small or not yet peer reviewed'] };
const SUPPORTS = { yes: 'The evidence backs this.', partly: 'The evidence is mixed.', no: 'The evidence goes against the popular idea.' };
/** Three well-known books per subject. Shown only when an Amazon tag is set; the links are searches, so no product page can go stale. */
export const BOOKS = {
  psychology: [['Thinking, Fast and Slow', 'Daniel Kahneman'], ['Influence', 'Robert Cialdini'], ['Noise', 'Daniel Kahneman, Olivier Sibony and Cass Sunstein']],
  technology: [['The Shallows', 'Nicholas Carr'], ['Irresistible', 'Adam Alter'], ['Stolen Focus', 'Johann Hari']],
  brain: [['Behave', 'Robert Sapolsky'], ['The Man Who Mistook His Wife for a Hat', 'Oliver Sacks'], ['Livewired', 'David Eagleman']],
  social: [['The Chaos Machine', 'Max Fisher'], ['Reclaiming Conversation', 'Sherry Turkle'], ['Ten Arguments for Deleting Your Social Media Accounts Right Now', 'Jaron Lanier']],
  society: [['Bullshit Jobs', 'David Graeber'], ['The Status Game', 'Will Storr'], ['Amusing Ourselves to Death', 'Neil Postman']],
  relationships: [['Attached', 'Amir Levine and Rachel Heller'], ['The Seven Principles for Making Marriage Work', 'John Gottman'], ['Together', 'Vivek Murthy']],
  health: [['Ultra-Processed People', 'Chris van Tulleken'], ['Breath', 'James Nestor'], ['Being Mortal', 'Atul Gawande']],
  science: [['A Short History of Nearly Everything', 'Bill Bryson'], ['The Order of Time', 'Carlo Rovelli'], ['The Selfish Gene', 'Richard Dawkins']],
  money: [['The Psychology of Money', 'Morgan Housel'], ['Scarcity', 'Sendhil Mullainathan and Eldar Shafir'], ['Poor Economics', 'Abhijit Banerjee and Esther Duflo']],
  future: [['The Coming Wave', 'Mustafa Suleyman'], ['Human Compatible', 'Stuart Russell'], ['Life 3.0', 'Max Tegmark']],
  history: [['SPQR', 'Mary Beard'], ['The Silk Roads', 'Peter Frankopan'], ['The Dawn of Everything', 'David Graeber and David Wengrow']],
};

const day = (iso) => new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
const dots = (n) => `<span class="dots" aria-hidden="true">${[0, 1, 2].map((i) => `<i${i < n ? ' class="on"' : ''}></i>`).join('')}</span>`;
const fileNo = (p) => String(p.n ?? 0).padStart(4, '0');
const hookOf = (p) => clean(p.hooks?.[p.hook || 0]?.text || p.title || p.topic);
const best = (p) => { const l = (p.claims || []).map((c) => c.level); return l.includes('established') ? 'established' : l.includes('supported') ? 'supported' : 'emerging'; };

export async function buildSite(store, out, { repo = '' } = {}) {
  const cfg = store.config || {}; const base = cfg.site || '/'; const money = cfg.money || {}; const minCred = cfg.minCredibility ?? 70;
  const posts = store.index.posts.filter((s) => !s.hidden && (s.cred ?? 100) >= minCred).map((s) => store.post(s.id)).filter((p) => p && !p.hidden && p.slides?.reveal?.headline);
  const write = (rel, text) => { const f = path.join(out, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
  const built = new Date().toISOString(); const pages = [];

  // ---------------------------------------------------------------------------------------------- shared chrome
  const moneyBar = (r) => {
    const b = [money.tips ? `<a class="btn solid" href="${esc(safeUrl(money.tips))}" target="_blank" rel="noopener sponsored">Support the research</a>` : '', money.newsletter ? `<a class="btn" href="${esc(safeUrl(money.newsletter))}" target="_blank" rel="noopener">Get the briefing by email</a>` : '', money.product ? `<a class="btn" href="${esc(safeUrl(money.product))}" target="_blank" rel="noopener sponsored">Get the collection</a>` : ''].filter(Boolean);
    return b.length ? `<div class="support"><p>The Truth has no paywall. Readers keep it running.</p><div class="btn-row">${b.join('')}</div></div>` : '';
  };
  const page = ({ title, description, rel, depth = 0, body, image = 'icons/og.png', type = 'website', jsonld = null, cls = '' }) => {
    const r = '../'.repeat(depth); const url = base + rel; pages.push({ rel, at: built });
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:site_name" content="The Truth"><meta property="og:type" content="${type}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(url)}"><meta property="og:image" content="${esc(base + image)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#000000">
<link rel="icon" href="${r}icons/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="${r}icons/apple-touch-icon.png"><link rel="manifest" href="${r}manifest.webmanifest">
<link rel="alternate" type="application/rss+xml" title="The Truth" href="${esc(base)}feed.xml">
<link rel="preload" href="${r}fonts/league-gothic-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${r}site/site.css">
${money.adsense ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(money.adsense)}" crossorigin="anonymous"></script>` : ''}
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body class="${cls}">
<a class="skip" href="#main">Skip to the text</a>
<header class="top"><a class="mark" href="${r || './'}">The Truth</a><nav aria-label="Sections"><a href="${r}library/">Library</a><a href="${r}briefing/">Briefing</a><a href="${r}about/">Method</a></nav></header>
<main id="main">${body}</main>
<footer class="foot"><div class="wrap">
  <p class="mark">The Truth</p>
  <p>Every claim on this site carries the exact words of the study it comes from. Found a mistake? <a href="https://github.com/${esc(repo)}/issues/new?title=${encodeURIComponent('Correction: ')}" rel="noopener">Tell us</a> and it gets fixed in public.</p>
  <p class="nav"><a href="${r}about/">How files are made</a><a href="${r}library/">Library</a><a href="${r}feed.xml">Feed</a>${cfg.handle ? `<a href="https://www.instagram.com/${esc(cfg.handle)}/" rel="noopener me">Instagram</a>` : ''}</p>
  ${money.amazon ? '<p class="small">As an Amazon Associate, The Truth earns from qualifying purchases.</p>' : ''}
</div></footer>
<script type="module" src="${r}site/site.js"></script>
</body>
</html>
`;
  };
  const cardHtml = (p, r) => `<a class="card" href="${r}f/${encodeURIComponent(p.id)}/"><img src="${r}data/thumb/${encodeURIComponent(p.id)}.jpg" alt="" width="540" height="675" loading="lazy"><span class="meta"><span>No. ${fileNo(p)}</span><span>${esc(SUBJECTS[p.subject] || '')}</span></span><span class="name">${esc(hookOf(p))}</span></a>`;

  // ---------------------------------------------------------------------------------------------- article
  for (const p of posts) {
    const r = '../../'; const hook = hookOf(p); const src = Object.fromEntries((p.sources || []).map((s) => [s.id, s])); const lv = LEVEL[best(p)]; const S = p.slides;
    const related = posts.filter((x) => x.id !== p.id && x.subject === p.subject).slice(0, 3); const more = related.length ? related : posts.filter((x) => x.id !== p.id).slice(0, 3);
    const books = money.amazon && BOOKS[p.subject] ? `<aside class="books"><h2>Books on this subject</h2><ul>${BOOKS[p.subject].map(([t, a]) => `<li><a href="https://www.amazon.com/s?k=${encodeURIComponent(`${t} ${a}`)}&amp;tag=${encodeURIComponent(money.amazon)}" target="_blank" rel="noopener sponsored"><b>${esc(t)}</b><span>${esc(a)}</span></a></li>`).join('')}</ul><p class="small">If you buy through these links, The Truth earns a commission at no cost to you.</p></aside>` : '';
    const body = `<article class="file wrap">
  <p class="series">${esc(SERIES[p.style] || 'The Truth')}</p>
  <h1 class="display">${esc(hook)}</h1>
  <p class="byline"><span>File no. ${fileNo(p)}</span><time datetime="${esc(p.created)}">${esc(day(p.created))}</time><a href="${r}s/${esc(p.subject)}/">${esc(SUBJECTS[p.subject] || p.subject)}</a></p>
  <div class="deck" data-post="${esc(p.id)}" data-root="${r}"><img src="${r}data/thumb/${encodeURIComponent(p.id)}.jpg" alt="Cover slide: ${esc(hook)}" width="540" height="675"></div>
  <div class="read">
    <p class="standfirst">${esc(S.reveal.headline)}</p>
    <p>${esc(S.reveal.body)}</p>
    <p class="level">${dots(lv[1])}<b>${lv[0]}.</b> ${esc(lv[2])}. ${esc(SUPPORTS[p.supports] || '')}</p>
    <h2>What the research found</h2>
    <ol class="thread">${(p.claims || []).map((c) => { const s = src[c.source] || {}; const u = safeUrl(s.url); const l = LEVEL[c.level] || LEVEL.supported;
      return `<li><p>${esc(c.text)}</p><blockquote>“${esc(c.quote)}”</blockquote><p class="cite">${dots(l[1])}${esc(KIND[s.type] || 'Study')}${s.year ? ', ' + esc(s.year) : ''}. ${u ? `<a href="${esc(u)}" rel="noopener nofollow">${esc(s.cite || 'Source')}${s.venue ? ', <i>' + esc(s.venue) + '</i>' : ''}</a>` : esc(s.cite || '')}.${c.link ? ' This shows a link, not a cause.' : ''}</p></li>`; }).join('')}</ol>
    ${S.explain?.headline ? `<h2>${esc(S.explain.headline)}</h2><p>${esc(S.explain.body)}</p>` : ''}
    ${S.matters?.headline ? `<h2>${esc(S.matters.headline)}</h2><p>${esc(S.matters.body)}</p><p class="note">This part is our reading of the evidence, not a finding.</p>` : ''}
    ${S.example?.headline ? `<h2>${esc(S.example.headline)}</h2><p>${esc(S.example.body)}</p>` : ''}
    ${p.verdict ? `<h2>The honest summary</h2><p>${esc(p.verdict)}</p>${p.caveat ? `<p>${esc(p.caveat)}</p>` : ''}` : ''}
    ${S.question?.headline ? `<p class="ask">${esc(S.question.headline)}</p>` : ''}
    ${moneyBar(r)}
    <h2>Sources</h2>
    <ul class="sources">${(p.sources || []).map((s) => { const u = safeUrl(s.url); return `<li>${esc(s.authors || s.cite || '')}${s.year ? ` (${esc(s.year)})` : ''}. ${u ? `<a href="${esc(u)}" rel="noopener nofollow">${esc(s.title)}</a>` : esc(s.title)}. ${s.venue ? `<i>${esc(s.venue)}</i>. ` : ''}${esc(KIND[s.type] || 'Study')}${s.citedBy ? `, cited ${Number(s.citedBy).toLocaleString('en-US')} times` : ''}.</li>`; }).join('')}</ul>
    ${(p.also || []).length ? `<details><summary>Also read for this file, not quoted</summary><ul class="sources">${p.also.map((s) => { const u = safeUrl(s.url); return `<li>${esc(s.cite || '')}${s.year ? ` (${esc(s.year)})` : ''}. ${u ? `<a href="${esc(u)}" rel="noopener nofollow">${esc(s.title)}</a>` : esc(s.title)}.</li>`; }).join('')}</ul></details>` : ''}
    <p class="made">This file was researched and drafted by software, then checked by rules a model cannot talk its way around: each quote above was matched word for word against the paper, and every number had to appear in it. <a href="${r}about/">How files are made</a>.</p>
    ${books}
  </div>
  ${more.length ? `<section class="more"><h2 class="title">${related.length ? 'More on ' + esc((SUBJECTS[p.subject] || '').toLowerCase()) : 'More files'}</h2><div class="grid">${more.map((x) => cardHtml(x, r)).join('')}</div></section>` : ''}
</article>`;
    const jsonld = { '@context': 'https://schema.org', '@type': 'Article', headline: hook.slice(0, 110), description: truncate(S.reveal.body || p.verdict || '', 200), datePublished: p.created, dateModified: p.created, image: [`${base}data/thumb/${p.id}.jpg`], mainEntityOfPage: `${base}f/${p.id}/`, author: { '@type': 'Organization', name: 'The Truth', url: base }, publisher: { '@type': 'Organization', name: 'The Truth', logo: { '@type': 'ImageObject', url: `${base}icons/icon-512.png` } }, citation: (p.sources || []).map((s) => safeUrl(s.url)).filter(Boolean) };
    write(`f/${p.id}/index.html`, page({ title: `${hook} | The Truth`, description: truncate(`${S.reveal.headline} ${S.reveal.body}`, 158), rel: `f/${p.id}/`, depth: 2, body, image: `data/thumb/${p.id}.jpg`, type: 'article', jsonld, cls: 'page-file' }));
  }

  // ---------------------------------------------------------------------------------------------- home
  const lead = posts[0]; const subjectsHtml = (r) => `<div class="subjects">${Object.entries(SUBJECTS).map(([k, v]) => { const n = posts.filter((p) => p.subject === k).length; return n ? `<a href="${r}s/${k}/">${esc(v)}<span>${n}</span></a>` : ''; }).join('')}</div>`;
  write('index.html', page({ title: 'The Truth — what the evidence actually says', description: 'Short, sourced files on the forces shaping your mind, your habits and the world around you. Every claim carries the exact words of the study it comes from.', rel: '', depth: 0, cls: 'page-home',
    jsonld: { '@context': 'https://schema.org', '@type': 'WebSite', name: 'The Truth', url: base },
    body: `<script>if ((navigator.standalone || matchMedia('(display-mode: standalone)').matches) && !/[?&]site/.test(location.search)) location.replace('studio/');</script>
${lead ? `<section class="hero wrap">
  <a class="hero-cover" href="f/${encodeURIComponent(lead.id)}/"><img src="data/thumb/${encodeURIComponent(lead.id)}.jpg" alt="" width="540" height="675"></a>
  <div><p class="series">${esc(SERIES[lead.style] || '')}</p><h1 class="display"><a href="f/${encodeURIComponent(lead.id)}/">${esc(hookOf(lead))}</a></h1>
  <p class="standfirst">${esc(lead.slides.reveal.body)}</p>
  <p class="level">${dots(LEVEL[best(lead)][1])}<b>${LEVEL[best(lead)][0]}.</b> ${(lead.claims || []).length} checked claims from ${(lead.sources || []).length} ${(lead.sources || []).length === 1 ? 'study' : 'studies'}.</p>
  <a class="btn solid" href="f/${encodeURIComponent(lead.id)}/">Read the file</a></div>
</section><div class="redline" aria-hidden="true"></div>` : '<section class="wrap"><h1 class="display">The first files are being researched.</h1></section>'}
<section class="wrap"><h2 class="title">Latest files</h2><div class="grid">${posts.slice(1, 13).map((p) => cardHtml(p, '')).join('')}</div>${posts.length > 13 ? '<p class="all"><a class="btn" href="library/">The whole library</a></p>' : ''}</section>
<section class="wrap"><h2 class="title">By subject</h2>${subjectsHtml('')}</section>
<section class="wrap creed"><p>The Truth is a research desk, not an opinion page. A file is only published when its claims can be tied, word for word, to a published study. When the evidence is mixed, the file says so. When it cannot be proven, it is dropped.</p>${moneyBar('')}</section>` }));

  // ---------------------------------------------------------------------------------------------- library (searchable)
  write('library/index.html', page({ title: 'Library | The Truth', description: `All ${posts.length} files: psychology, technology, the brain, society, money, health, science and history.`, rel: 'library/', depth: 1, cls: 'page-library',
    body: `<section class="wrap"><h1 class="display">The library</h1><p class="standfirst">${posts.length} file${posts.length === 1 ? '' : 's'}, newest first.</p>
<label class="search"><span>Search the files</span><input type="search" id="q" placeholder="sleep, money, phones…" autocomplete="off"></label>
${subjectsHtml('../')}
<div class="grid" id="lib">${posts.map((p) => cardHtml(p, '../').replace('<a class="card"', `<a class="card" data-text="${esc(`${hookOf(p)} ${p.topic} ${p.title} ${SUBJECTS[p.subject] || ''}`.toLowerCase())}"`)).join('')}</div><p class="empty" id="none" hidden>No file matches that yet.</p></section>` }));

  // ---------------------------------------------------------------------------------------------- subjects
  for (const [k, v] of Object.entries(SUBJECTS)) {
    const list = posts.filter((p) => p.subject === k); if (!list.length) continue;
    write(`s/${k}/index.html`, page({ title: `${v} | The Truth`, description: `${list.length} sourced file${list.length === 1 ? '' : 's'} on ${v.toLowerCase()}.`, rel: `s/${k}/`, depth: 2, body: `<section class="wrap"><p class="series">Subject</p><h1 class="display">${esc(v)}</h1><div class="grid">${list.map((p) => cardHtml(p, '../../')).join('')}</div></section>` }));
  }

  // ---------------------------------------------------------------------------------------------- briefing (the last seven days)
  const week = posts.filter((p) => Date.now() - new Date(p.created).getTime() < 7 * 86400e3); const brief = (week.length >= 3 ? week : posts.slice(0, 7));
  write('briefing/index.html', page({ title: 'The briefing | The Truth', description: 'This week’s files in two minutes: what was found, and how sure anyone can be.', rel: 'briefing/', depth: 1, cls: 'page-briefing',
    body: `<section class="wrap"><p class="series">Updated ${esc(day(built))}</p><h1 class="display">The briefing</h1><p class="standfirst">The newest files, each in two sentences.</p>
<ol class="brief">${brief.map((p) => `<li><a href="../f/${encodeURIComponent(p.id)}/"><h2>${esc(hookOf(p))}</h2></a><p>${esc(p.slides.reveal.body)}</p><p class="level">${dots(LEVEL[best(p)][1])}<b>${LEVEL[best(p)][0]}.</b> ${esc(p.verdict || '')}</p></li>`).join('')}</ol>${moneyBar('../')}</section>` }));

  // ---------------------------------------------------------------------------------------------- method / about
  write('about/index.html', page({ title: 'How files are made | The Truth', description: 'The method behind The Truth: where the evidence comes from, how it is checked, what the evidence labels mean, and how corrections work.', rel: 'about/', depth: 1, cls: 'page-about',
    body: `<article class="wrap"><h1 class="display">How files are made</h1><div class="read">
<p class="standfirst">The Truth exists to show what the evidence says, including when that is less dramatic than the headline you have already seen.</p>
<ol class="thread">
<li><h2>A question</h2><p>Each file starts as one question about everyday life that researchers have actually studied.</p></li>
<li><h2>The search</h2><p>Software searches Europe PMC and OpenAlex, two open indexes of scholarly papers, and ranks what comes back. Pooled analyses of many studies outrank single studies; well-cited work outranks obscure work.</p></li>
<li><h2>Claims with quotes</h2><p>An AI model reads the papers’ summaries and proposes claims. For each one it must supply the exact words from the paper that prove it.</p></li>
<li><h2>Checks a model cannot talk its way around</h2><p>Code, not the model, then verifies every claim. The quote must be found in the paper. Every number in the claim must appear in the paper. A study that only shows a link may not be described with cause-and-effect words. Anything that fails is thrown out.</p></li>
<li><h2>Writing</h2><p>The file is written from the surviving claims only. It is checked again, and any sentence carrying an unproven number is cut. If fewer than two claims survive, nothing is published.</p></li>
</ol>
<h2>What the labels mean</h2>
<p class="level">${dots(3)}<b>Established.</b> Several studies combined (a meta-analysis or systematic review), or official statistics.</p>
<p class="level">${dots(2)}<b>Supported.</b> At least one solid peer-reviewed study.</p>
<p class="level">${dots(1)}<b>Emerging.</b> Early, small, or not yet peer reviewed.</p>
<p>Paragraphs marked as “our reading” are interpretation, not findings.</p>
<h2>What this cannot do</h2>
<p>The checks work on papers’ published summaries, not their full text, and a summary can leave out limits the full paper admits. A quote can be accurate and still be read too generously. Science also changes: a file reflects what was published when it was made. Nothing here is medical, financial or legal advice.</p>
<h2>Corrections</h2>
<p>If something is wrong, <a href="https://github.com/${esc(repo)}/issues/new?title=${encodeURIComponent('Correction: ')}" rel="noopener">report it</a>. Corrections are made in public.</p>
${money.amazon || money.adsense || money.tips || money.product ? `<h2>How the site is paid for</h2><p>${[money.tips ? 'Readers can support it directly.' : '', money.amazon ? 'Book links are affiliate links: if you buy through them, The Truth earns a commission at no cost to you. As an Amazon Associate, The Truth earns from qualifying purchases.' : '', money.adsense ? 'The site shows advertising from Google, which uses cookies to choose ads; you can control that in <a href="https://adssettings.google.com/" rel="noopener">Google’s ad settings</a>.' : '', money.product ? 'A collected edition of the files is sold separately.' : ''].filter(Boolean).join(' ')} None of this affects what is researched or what is published.</p>` : ''}
</div></article>` }));

  // ---------------------------------------------------------------------------------------------- link page (for the Instagram bio)
  write('links/index.html', page({ title: 'The Truth — links', description: 'The newest file, the library and the briefing.', rel: 'links/', depth: 1, cls: 'page-links',
    body: `<section class="wrap links"><h1 class="display">The Truth</h1><p class="standfirst">What the evidence actually says.</p>
${lead ? `<a class="btn solid" href="../f/${encodeURIComponent(lead.id)}/">Newest file: ${esc(hookOf(lead))}</a>` : ''}<a class="btn" href="../library/">Every file, with its sources</a><a class="btn" href="../briefing/">This week in two minutes</a>
${money.newsletter ? `<a class="btn" href="${esc(safeUrl(money.newsletter))}" rel="noopener">Get the briefing by email</a>` : ''}${money.tips ? `<a class="btn" href="${esc(safeUrl(money.tips))}" rel="noopener sponsored">Support the research</a>` : ''}${money.product ? `<a class="btn" href="${esc(safeUrl(money.product))}" rel="noopener sponsored">Get the collection</a>` : ''}</section>` }));

  // ---------------------------------------------------------------------------------------------- feed, sitemap, robots, ads.txt
  const x = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  write('feed.xml', `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>The Truth</title><link>${x(base)}</link><description>What the evidence actually says.</description><language>en</language><atom:link href="${x(base)}feed.xml" rel="self" type="application/rss+xml"/><lastBuildDate>${new Date(built).toUTCString()}</lastBuildDate>
${posts.slice(0, 40).map((p) => `<item><title>${x(hookOf(p))}</title><link>${x(base)}f/${x(p.id)}/</link><guid isPermaLink="true">${x(base)}f/${x(p.id)}/</guid><pubDate>${new Date(p.created).toUTCString()}</pubDate><category>${x(SUBJECTS[p.subject] || '')}</category><description>${x(`${p.slides.reveal.headline} ${p.slides.reveal.body} ${p.verdict || ''}`)}</description><enclosure url="${x(base)}data/thumb/${x(p.id)}.jpg" type="image/jpeg" length="0"/></item>`).join('\n')}
</channel></rss>
`);
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((pg) => `<url><loc>${x(base + pg.rel)}</loc><lastmod>${built.slice(0, 10)}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  write('robots.txt', `User-agent: *\nAllow: /\nDisallow: ${new URL(base, 'https://x.invalid').pathname}studio/\nSitemap: ${base}sitemap.xml\n`);
  if (money.adsense) write('ads.txt', `google.com, ${money.adsense.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`);
  return { pages: pages.length, files: posts.length };
}
