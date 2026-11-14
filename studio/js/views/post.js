// The file editor: swipe the real slides, change the words, pick the hook, set the look, read the proof, approve.
import { $, $$, esc, on, toast, sheet, SUBJECTS, LEVELS, dots, stamp, fmtDate, ymd } from '../ui.js';
import { S, local, statusOf, patch, saveSettings, scheduledOn, byStatus, waiting } from '../state.js';
import { loadPost } from '../data.js';
import * as db from '../db.js';
import { deckOf, imagesFor, paint, forgetUpload, SIZE } from '../render.js';
import { PRESETS, DEFAULT_THEME } from '../../../render/index.js';
import { unsupportedNumbers } from '../../../shared/ground.js';
import { themeOf, captionText, copy } from '../export.js';
import { ask } from '../engine.js';
import { openShare } from './share.js';
import { fileNo, seriesOf, askSheet } from './common.js';

let E = null;
const TABS = [['text', 'Text'], ['look', 'Look'], ['caption', 'Caption'], ['proof', 'Proof']];
const ROLE = { cover: 'Cover', reveal: 'The fact', explain: 'What is happening', matters: 'Why it matters', example: 'Real life', question: 'The question', sources: 'Sources' };
const HOOK = { question: 'Question', contradiction: 'Contradiction', accusation: 'Accusation', scene: 'Scene', number: 'Number', statement: 'Statement' };
const ACCENTS = [['#d4122a', 'Signal red'], ['#a50f22', 'Dried blood'], ['#e8341c', 'Vermilion'], ['#ff2d55', 'Hot red'], ['#f3f1ec', 'No colour']];
const SLOTS = [['cover', 'Cover', 0], ['matters', 'Why it matters', 1], ['example', 'Real life', 2]];
const CLOCK = /\b\d{1,2}(?::\d{2})?\s?(?:a\.?m\.?|p\.?m\.?|o'clock)\b|\b\d{1,2}:\d{2}\b/gi;

const loc = () => local(E.id);
const look = () => ({ ...DEFAULT_THEME, ...themeOf(), ...(loc().theme || {}) });
const evidence = () => (E.post.claims || []).map((c) => `${c.text} ${c.quote}`).join(' ');
const slideText = (role) => ({ ...(E.post.slides?.[role] || {}), ...(loc().edits?.slides?.[role] || {}) });
const edited = (role) => !!loc().edits?.slides?.[role];
function setSlide(role, change) { const l = loc(); return patch(E.id, { edits: { ...(l.edits || {}), slides: { ...(l.edits?.slides || {}), [role]: { ...slideText(role), ...change } } } }); }
function clearSlide(role) { const l = loc(); const slides = { ...(l.edits?.slides || {}) }; delete slides[role]; const alt = { ...(l.alt || {}) }; delete alt[role]; return patch(E.id, { edits: { ...(l.edits || {}), slides }, alt }); }

// ------------------------------------------------------------------------------------------------ slides
function rebuild() { E.deck = deckOf(E.post, themeOf(), loc()); }
function frames() {
  const reel = $('#reel', E.root); const n = E.deck.slides.length; if (reel.children.length === n) return;
  reel.innerHTML = E.deck.slides.map((s, i) => `<div class="frame"><canvas width="${SIZE.w}" height="${SIZE.h}" data-i="${i}" role="img" aria-label="Slide ${i + 1} of ${n}: ${ROLE[s.role]}"></canvas></div>`).join('');
  E.slide = Math.min(E.slide, n - 1); pager();
}
function pager() { $('#pager', E.root).innerHTML = E.deck.slides.map((_, i) => `<i class="${i === E.slide ? 'on' : ''}"></i>`).join(''); const w = $('#where', E.root); if (w) w.textContent = `${E.slide + 1} of ${E.deck.slides.length} — ${ROLE[E.deck.slides[E.slide].role]}`; }
function paintOne(i) { const cv = $(`canvas[data-i="${i}"]`, E.root); if (cv) paint(cv, E.deck, i, E.images); }
function paintAll() {
  const me = E; frames(); paintOne(E.slide); const rest = E.deck.slides.map((_, i) => i).filter((i) => i !== E.slide); let k = 0;
  const step = () => { if (E !== me || k >= rest.length) return; paintOne(rest[k++]); setTimeout(step, 0); }; setTimeout(step, 0);
}
let paintTimer;
function repaint(all = false, wait = 110) { clearTimeout(paintTimer); const me = E; paintTimer = setTimeout(() => { if (E !== me) return; rebuild(); if (all) paintAll(); else { frames(); paintOne(E.slide); } }, wait); }
function go(i) { const reel = $('#reel', E.root); const n = E.deck.slides.length; const k = Math.max(0, Math.min(n - 1, i)); reel.scrollTo({ left: k * reel.clientWidth, behavior: 'smooth' }); }

// ------------------------------------------------------------------------------------------------ panels
const field = (label, name, value, rows, extra = '') => `<label class="field"><span>${label}<em id="count-${name}"></em></span><textarea rows="${rows}" data-f="${name}" ${extra}>${esc(value || '')}</textarea><p class="warn" id="warn-${name}" hidden></p></label>`;

function warn(name, text, role) {
  const el = $('#warn-' + name, E.root); if (!el) return; const probe = role === 'example' || role === 'question' ? String(text || '').replace(CLOCK, ' ') : text;
  const bad = text ? unsupportedNumbers(probe, evidence()) : [];
  el.hidden = !bad.length; el.textContent = bad.length ? `${bad.join(', ')} ${bad.length === 1 ? 'is' : 'are'} not in the checked facts. Only keep ${bad.length === 1 ? 'it' : 'them'} if you can point to a source.` : '';
}

function textPanel() {
  const s = E.deck.slides[E.slide]; const role = s.role;
  if (role === 'cover') return hookPanel();
  if (role === 'sources') return `<p class="read" style="margin-top:18px">The last slide lists the studies this file stands on. It is filled in from the research and cannot be edited, so nobody can question where a claim came from.</p>
    <p class="quiet" style="margin-top:12px">Your account name and website also appear here. Set them once in <a class="link" href="#/settings">Settings</a>.</p>`;
  const t = slideText(role); const alts = E.post.alts?.[role] || []; const k = loc().alt?.[role] || 0; const stat = role === 'reveal' ? (loc().edits && 'stat' in loc().edits ? loc().edits.stat : E.post.stat) : null;
  return `${role === 'reveal' ? `<div class="pair"><label class="field"><span>Big number</span><input type="text" data-f="stat.value" value="${esc(stat?.value || '')}" placeholder="none"></label><label class="field"><span>What it counts</span><input type="text" data-f="stat.label" value="${esc(stat?.label || '')}"></label></div><p class="warn" id="warn-stat" hidden></p>` : ''}
    ${field('Headline', 'headline', t.headline, 2)}${field('Text', 'body', t.body, 5)}
    <div class="btn-row" style="margin-top:16px">${alts.length ? `<button class="btn" data-act="alt">Another version <small>${k + 1} of ${alts.length + 1}</small></button>` : `<button class="btn" data-act="rewrite">Ask for a rewrite</button>`}<button class="btn ghost" data-act="undo" id="undo-btn" ${edited(role) ? '' : 'hidden'}>Undo my changes</button></div>`;
}

function hookPanel() {
  const l = loc(); const hooks = E.post.hooks || []; const cur = l.hookText ? -1 : l.hook ?? E.post.hook ?? 0;
  return `<div class="hooks">${hooks.map((h, i) => `<button class="hook" data-hook="${i}" aria-pressed="${i === cur}"><small>${esc(HOOK[h.type] || 'Hook')}</small><span>${esc(h.text)}</span></button>`).join('')}</div>
    <label class="field"><span>Or write your own</span><textarea rows="2" data-f="hookText" placeholder="Your own first line">${esc(l.hookText || '')}</textarea><p class="warn" id="warn-hookText" hidden></p></label>
    ${hooks.length > 1 ? '<button class="btn block" data-act="compare" style="margin-top:14px">See the covers side by side</button>' : ''}`;
}

function lookPanel() {
  const t = look(); const l = loc(); const own = !!l.theme && Object.keys(l.theme).length > 0;
  const range = (label, key, v) => `<label class="field"><span>${label}<em>${Math.round(v * 100)}</em></span><input type="range" min="0" max="1" step="0.05" value="${v}" data-look="${key}"></label>`;
  const toggle = (label, key, v) => `<label class="toggle"><input type="checkbox" data-look="${key}" ${v ? 'checked' : ''}><span>${label}</span></label>`;
  return `<span class="label" style="display:block;margin-top:20px">Style</span>
    <div class="presets">${Object.entries(PRESETS).map(([k, p]) => `<button data-preset="${k}" aria-pressed="${t.preset === k}"><b class="pv pv-${k}">Aa</b><span>${esc(p.label)}</span></button>`).join('')}</div>
    <span class="label" style="display:block;margin-top:22px">Accent</span>
    <div class="swatches">${ACCENTS.map(([c, n]) => `<button data-accent="${c}" aria-pressed="${t.accent.toLowerCase() === c}" aria-label="${n}" style="--c:${c}"></button>`).join('')}</div>
    ${range('Film grain', 'grain', t.grain)}${range('Light', 'light', t.light)}${range('Photo darkness', 'photo', t.photo)}
    <div class="toggles">${toggle('Evidence label on fact slides', 'evidenceTags', t.evidenceTags)}${toggle('“Swipe” on the cover', 'swipeHint', t.swipeHint)}${toggle('The red thread', 'thread', t.thread)}</div>
    <span class="label" style="display:block;margin-top:24px">Pictures</span>
    <div class="list slots">${SLOTS.map(([slot, name, idx]) => { const up = l.uploads?.[slot]; const off = (l.noImage || []).includes(slot); const has = up || (E.post.images?.[idx]?.file && !off);
      return `<div><div class="grow"><h3>${name}</h3><p>${up ? 'Your picture' : has ? esc(E.post.images[idx].credit || 'Picture found by the engine') : 'No picture — light on black'}</p></div><label class="btn small-btn">${has ? 'Change' : 'Add'}<input type="file" accept="image/*" data-slot="${slot}" hidden></label>${has ? `<button class="btn ghost small-btn" data-unslot="${slot}">Remove</button>` : ''}</div>`; }).join('')}</div>
    <div class="btn-row" style="margin-top:20px"><button class="btn" data-act="look-all" ${own ? '' : 'disabled'}>Use this look for every file</button>${own ? '<button class="btn ghost" data-act="look-reset">Back to my usual look</button>' : ''}</div>`;
}

function captionPanel() {
  const l = loc(); const cap = l.caption ?? E.post.caption ?? ''; const tags = (l.hashtags ?? E.post.hashtags ?? []).map((t) => '#' + String(t).replace(/^#/, '')).join(' ');
  return `${field('Caption', 'caption', cap, 9)}
    <label class="field"><span>Hashtags<em id="count-tags"></em></span><textarea rows="2" data-f="hashtags">${esc(tags)}</textarea></label>
    <div class="btn-row" style="margin-top:16px"><button class="btn" data-act="copy-caption">Copy caption and hashtags</button></div>
    <p class="quiet small" style="margin-top:12px">Instagram allows 2,200 characters. Three to five hashtags is plenty.</p>`;
}

function proofPanel() {
  const p = E.post; const cred = p.credibility || {}; const src = Object.fromEntries((p.sources || []).map((s) => [s.id, s])); const n = Object.keys(loc().edits?.slides || {}).length;
  const KIND = { 'meta-analysis': 'Meta-analysis', 'systematic-review': 'Systematic review', rct: 'Randomized trial', trial: 'Clinical trial', experiment: 'Experiment', review: 'Review', observational: 'Observational study', preprint: 'Preprint, not peer reviewed', study: 'Study', data: 'Official data', encyclopedia: 'Background' };
  return `<div class="score" style="margin-top:22px"><b>${cred.score ?? '—'}</b><div><span class="label">Credibility</span><p class="quiet small">Out of 100. How much a reader can lean on this file.</p></div></div>
    ${n ? `<div class="flag hot" style="margin-top:14px">You changed ${n} slide${n === 1 ? '' : 's'} after the check. The score covers the original wording.</div>` : ''}
    <div style="margin-top:14px">${(cred.flags || []).map((f) => `<div class="flag">${esc(f)}</div>`).join('') || '<div class="flag">No warnings.</div>'}</div>
    ${p.verdict ? `<span class="label" style="display:block;margin-top:26px">What the evidence says</span><p class="read" style="margin-top:8px">${esc(p.verdict)}</p>` : ''}
    ${p.caveat ? `<p class="read quiet" style="margin-top:8px">${esc(p.caveat)}</p>` : ''}
    <span class="label" style="display:block;margin-top:26px">Every claim, with its proof</span>
    <div>${(p.claims || []).map((c) => { const s = src[c.source] || {}; const lv = LEVELS[c.level] || LEVELS.supported;
      return `<div class="claim"><p>${esc(c.text)}</p><blockquote>“${esc(c.quote)}”</blockquote><span class="src">${dots(lv.dots)} ${esc(lv.label)}. ${esc(KIND[s.type] || 'Study')}${s.year ? ', ' + s.year : ''}. ${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.cite || s.authors || 'Source')}${s.venue ? ', ' + esc(s.venue) : ''}</a>` : esc(s.cite || '')}${c.link ? '<br>Shows a link, not a cause. The slides are worded that way.' : ''}</span></div>`; }).join('')}</div>
    ${(p.also || []).length ? `<span class="label" style="display:block;margin-top:22px">Also read, not quoted</span><div class="also">${p.also.map((s) => `<p>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>` : esc(s.title)} <span class="quiet">${esc(s.cite || '')}${s.year ? ', ' + s.year : ''}</span></p>`).join('')}</div>` : ''}
    <a class="btn block" style="margin-top:22px" href="#/research/${encodeURIComponent(p.id)}">Open the full research trail</a>`;
}

function panel() {
  const html = { text: textPanel, look: lookPanel, caption: captionPanel, proof: proofPanel }[E.tab](); $('#panel', E.root).innerHTML = html;
  $$('.seg button', E.root).forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === E.tab));
  if (E.tab === 'text') { const role = E.deck.slides[E.slide].role; for (const f of ['headline', 'body']) { const el = $(`[data-f="${f}"]`, E.root); if (el) warn(f, el.value, role); } }
  if (E.tab === 'caption') counts();
}
function counts() { const c = $('[data-f="caption"]', E.root), t = $('[data-f="hashtags"]', E.root); if (!c) return; const total = captionText(E.post, loc()).length; $('#count-caption', E.root).textContent = `${total} / 2200`; $('#count-tags', E.root).textContent = `${(t.value.match(/#/g) || []).length}`; }

function head() { const st = $('#ed-stamp', E.root); if (st) st.innerHTML = stamp(statusOf(E.id)); }
function bar() {
  const st = statusOf(E.id); const l = loc(); const b = $('#bar', E.root); if (!b) return;
  b.innerHTML = ({
    approved: '<button class="btn" data-act="schedule">Schedule</button><button class="btn primary" data-act="share">Share</button>',
    scheduled: `<button class="btn" data-act="schedule">${esc(l.date ? fmtDate(l.date + 'T12:00') : 'Schedule')}</button><button class="btn primary" data-act="share">Share</button>`,
    posted: '<button class="btn" data-act="results">Log results</button><button class="btn" data-act="share">Share again</button>',
    skipped: '<button class="btn block" data-act="restore">Bring it back to drafts</button>',
  })[st] || '<button class="btn" data-act="skip">Skip</button><button class="btn primary" data-act="approve">Approve</button>';
}

// ------------------------------------------------------------------------------------------------ actions
function nextFreeDay() { const d = new Date(); const per = S.settings.perDay || 1; for (let i = 0; i < 120; i++) { if (scheduledOn(ymd(d)).filter((p) => p.id !== E.id).length < per) return ymd(d); d.setDate(d.getDate() + 1); } return ymd(); }

async function setLook(change) { const l = loc(); await patch(E.id, { theme: { ...(l.theme || {}), ...change } }); repaint(true, 60); }

async function addPicture(slot, file) {
  const bmp = await createImageBitmap(file).catch(() => null); if (!bmp) return toast('That picture could not be opened');
  const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height)); const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9)); const key = `img:${E.id}:${slot}`; await db.set(key, blob); forgetUpload(key);
  const l = loc(); await patch(E.id, { uploads: { ...(l.uploads || {}), [slot]: key }, noImage: (l.noImage || []).filter((s) => s !== slot) });
  E.images = await imagesFor(E.post, loc()); repaint(true, 0); panel(); toast('Picture added');
}
async function removePicture(slot) {
  const l = loc(); const key = l.uploads?.[slot]; const uploads = { ...(l.uploads || {}) }; delete uploads[slot];
  if (key) { await db.del(key).catch(() => {}); forgetUpload(key); await patch(E.id, { uploads }); } else await patch(E.id, { noImage: [...new Set([...(l.noImage || []), slot])] });
  E.images = await imagesFor(E.post, loc()); repaint(true, 0); panel();
}

function compare() {
  const hooks = E.post.hooks || []; const me = E;
  sheet(`<h2 class="title">Pick the cover</h2><div class="covers">${hooks.map((h, i) => `<button data-pick="${i}"><canvas width="432" height="540"></canvas><small>${esc(HOOK[h.type] || 'Hook')}</small></button>`).join('')}</div>`, (body, close) => {
    const full = document.createElement('canvas'); let i = 0;
    const step = () => { if (E !== me || !body.isConnected || i >= hooks.length) return; const deck = deckOf(E.post, themeOf(), { ...loc(), hook: i, hookText: '' }); paint(full, deck, 0, E.images); const cv = $$('canvas', body)[i]; const x = cv.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(full, 0, 0, 432, 540); i++; setTimeout(step, 0); };
    step(); on(body, 'click', '[data-pick]', async (b) => { await patch(E.id, { hook: Number(b.dataset.pick), hookText: '' }); close(); E.slide = 0; repaint(false, 0); panel(); });
  });
}

function scheduleSheet() {
  const l = loc(); const day = l.date || nextFreeDay();
  sheet(`<h2 class="title">Which day?</h2><label class="field"><span>Post on</span><input type="date" id="sc-date" value="${day}" min="${ymd()}"></label>
    <div class="stack" style="margin-top:18px"><button class="btn primary block" id="sc-save">Put it on the calendar</button>${l.status === 'scheduled' ? '<button class="btn block" id="sc-off">Take it off the calendar</button>' : ''}</div>
    <p class="quiet small" style="margin-top:12px">The studio cannot post for you. On the day, it shows this file first on Today with a Share button.</p>`, (body, close) => {
    $('#sc-save', body).onclick = async () => { const d = $('#sc-date', body).value || day; await patch(E.id, { status: 'scheduled', date: d }); close(); toast(`Planned for ${fmtDate(d + 'T12:00')}`); };
    const off = $('#sc-off', body); if (off) off.onclick = async () => { await patch(E.id, { status: 'approved', date: null }); close(); };
  });
}

function resultsSheet() {
  const m = loc().metrics || {}; const f = (k, label) => `<label class="field"><span>${label}</span><input type="number" inputmode="numeric" min="0" data-m="${k}" value="${m[k] ?? ''}"></label>`;
  sheet(`<h2 class="title">How did it do?</h2><p class="quiet" style="margin-top:8px">Copy the numbers from the post’s Insights in Instagram. The studio uses them to work out which kinds of post to make more of.</p>
    <div class="pair">${f('reach', 'Accounts reached')}${f('likes', 'Likes')}</div><div class="pair">${f('saves', 'Saves')}${f('shares', 'Shares')}</div><div class="pair">${f('comments', 'Comments')}${f('follows', 'New followers')}</div>
    <button class="btn primary block" id="rs-save" style="margin-top:18px">Save the numbers</button>`, (body, close) => {
    $('#rs-save', body).onclick = async () => { const out = { at: new Date().toISOString() }; for (const i of $$('[data-m]', body)) if (i.value !== '') out[i.dataset.m] = Math.max(0, Number(i.value) || 0); await patch(E.id, { metrics: out }); close(); toast('Saved'); };
  });
}

async function moreSheet() {
  const removeHref = await ask.remove(E.id); const st = statusOf(E.id);
  sheet(`<h2 class="title">File ${fileNo(E.post)}</h2><div class="stack" style="margin-top:16px">
    ${['approved', 'scheduled', 'posted'].includes(st) ? '<button class="btn block" data-more="draft">Move back to drafts</button>' : ''}
    ${st !== 'posted' ? '<button class="btn block" data-more="posted">Mark as posted</button>' : ''}
    <button class="btn block" data-more="reset">Throw away all my changes to this file</button>
    <a class="btn block" href="${esc(removeHref)}" target="_blank" rel="noopener">Take this file off the website</a></div>`, (body, close) => {
    on(body, 'click', '[data-more]', async (b) => {
      const a = b.dataset.more;
      if (a === 'draft') await patch(E.id, { status: 'draft', date: null });
      if (a === 'posted') await patch(E.id, { status: 'posted', postedAt: new Date().toISOString(), date: ymd() });
      if (a === 'reset') { const l = loc(); for (const key of Object.values(l.uploads || {})) { await db.del(key).catch(() => {}); forgetUpload(key); } await patch(E.id, { edits: null, hook: null, hookText: '', theme: null, uploads: null, noImage: null, caption: null, hashtags: null, alt: null }); E.images = await imagesFor(E.post, loc()); repaint(true, 0); panel(); toast('Back to the engine’s version'); }
      close();
    });
  });
}

/** Straight to the next file that still needs a decision. */
function nextDraft() { const todo = [...byStatus('draft'), ...waiting()].filter((p) => p.id !== E.id); location.hash = todo.length ? `#/post/${encodeURIComponent(todo[0].id)}` : '#/today'; }

async function act(name) {
  const role = E.deck.slides[E.slide]?.role;
  if (name === 'approve') { await patch(E.id, { status: 'approved', approvedAt: new Date().toISOString() }); toast('Approved'); }
  else if (name === 'skip') { await patch(E.id, { status: 'skipped' }); toast('Skipped'); nextDraft(); }
  else if (name === 'next') nextDraft();
  else if (name === 'restore') await patch(E.id, { status: 'draft' });
  else if (name === 'share') openShare({ ...E.post }, { onDone: () => {} });
  else if (name === 'schedule') scheduleSheet();
  else if (name === 'results') resultsSheet();
  else if (name === 'more') moreSheet();
  else if (name === 'compare') compare();
  else if (name === 'undo') { await clearSlide(role); repaint(false, 0); panel(); }
  else if (name === 'alt') { const alts = E.post.alts?.[role] || []; const k = ((loc().alt?.[role] || 0) + 1) % (alts.length + 1); if (k === 0) await clearSlide(role); else { await setSlide(role, { headline: alts[k - 1].headline, body: alts[k - 1].body }); await patch(E.id, { alt: { ...(loc().alt || {}), [role]: k } }); } repaint(false, 0); panel(); }
  else if (name === 'rewrite') askSheet({ title: 'Ask for a rewrite', href: await ask.rewrite(E.id, role), button: 'Send to the engine', lines: [`The engine will write new versions of “${esc(ROLE[role])}” from the same checked facts. They show up here under “Another version” after its next run.`] });
  else if (name === 'copy-caption') toast((await copy(captionText(E.post, loc()))) ? 'Copied' : 'Could not copy');
  else if (name === 'look-all') { await saveSettings({ theme: { ...(S.settings.theme || {}), ...(loc().theme || {}) } }); await patch(E.id, { theme: null }); repaint(true, 0); panel(); toast('Every file now uses this look'); }
  else if (name === 'look-reset') { await patch(E.id, { theme: null }); repaint(true, 0); panel(); }
}

function onInput(el) {
  const f = el.dataset.f; const role = E.deck.slides[E.slide]?.role;
  if (f === 'headline' || f === 'body') { setSlide(role, { [f]: el.value }); warn(f, el.value, role); const u = $('#undo-btn', E.root); if (u) u.hidden = false; repaint(false); }
  else if (f === 'hookText') { patch(E.id, { hookText: el.value }); $$('.hook', E.root).forEach((b) => b.setAttribute('aria-pressed', !el.value.trim() && Number(b.dataset.hook) === (loc().hook ?? E.post.hook ?? 0))); warn('hookText', el.value, 'cover'); repaint(false); }
  else if (f === 'stat.value' || f === 'stat.label') {
    const l = loc(); const cur = l.edits && 'stat' in l.edits ? l.edits.stat : E.post.stat; const next = { fact: cur?.fact || E.post.claims?.[0]?.id || '', value: cur?.value || '', label: cur?.label || '', [f.split('.')[1]]: el.value };
    patch(E.id, { edits: { ...(l.edits || {}), stat: next.value.trim() ? next : null } }); const w = $('#warn-stat', E.root); const bad = unsupportedNumbers(`${next.value} ${next.label}`, evidence());
    w.hidden = !bad.length; w.textContent = bad.length ? `${bad.join(', ')} ${bad.length === 1 ? 'is' : 'are'} not in the checked facts.` : ''; repaint(false);
  } else if (f === 'caption') { patch(E.id, { caption: el.value }); counts(); }
  else if (f === 'hashtags') { patch(E.id, { hashtags: el.value.split(/[\s,]+/).map((t) => t.replace(/^#/, '').trim()).filter(Boolean) }); counts(); }
}

// ------------------------------------------------------------------------------------------------ lifecycle
export async function mount(root, [id, tab]) {
  const post = await loadPost(id);
  if (!post) { root.innerHTML = '<div class="wrap"><div class="empty"><h2 class="title">That file is not in the library</h2><p style="margin-top:14px"><a class="btn" href="#/files">Back to files</a></p></div></div>'; E = null; return; }
  if (statusOf(id) === 'new') await patch(id, { status: 'draft', taken: new Date().toISOString() });
  E = { root, id, post, tab: TABS.some((t) => t[0] === tab) ? tab : 'text', slide: 0, deck: null, images: {} };
  root.innerHTML = `<div class="editor">
    <div class="stage">
      <div class="file-head"><a class="back" href="#/files" aria-label="Back to files">Files</a><span class="no">No. ${fileNo(post)}</span><span id="ed-stamp"></span><span class="grow"></span><button class="btn ghost small-btn" data-act="next">Next</button><button class="btn ghost small-btn" data-act="more">More</button></div>
      <div class="reel-wrap"><div class="reel" id="reel" tabindex="0" aria-label="Slides"></div><button class="nav prev" data-nav="-1" aria-label="Previous slide"></button><button class="nav next" data-nav="1" aria-label="Next slide"></button></div>
      <div class="pager" id="pager"></div><p class="where" id="where"></p>
    </div>
    <div class="side">
      <div class="seg" role="tablist">${TABS.map(([k, n]) => `<button role="tab" data-tab="${k}">${n}</button>`).join('')}</div>
      <div class="wrap" id="panel"></div>
      <div class="bar" id="bar"></div>
    </div></div>`;
  rebuild(); frames(); E.images = await imagesFor(post, loc()); if (!E || E.id !== id) return;
  paintAll(); panel(); head(); bar();
  const reel = $('#reel', root); let raf;
  reel.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (!E) return; const i = Math.round(reel.scrollLeft / Math.max(1, reel.clientWidth)); if (i !== E.slide) { E.slide = i; pager(); if (E.tab === 'text') panel(); } }); }, { passive: true });
  reel.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') go(E.slide + 1); if (e.key === 'ArrowLeft') go(E.slide - 1); });
  on(root, 'click', '[data-nav]', (b) => go(E.slide + Number(b.dataset.nav)));
  on(root, 'click', '[data-tab]', (b) => { E.tab = b.dataset.tab; history.replaceState(null, '', `#/post/${encodeURIComponent(E.id)}/${E.tab}`); panel(); });
  on(root, 'click', '[data-act]', (b) => act(b.dataset.act).catch((e) => { console.error(e); toast('That did not work: ' + (e.message || e)); }));
  on(root, 'click', '[data-hook]', async (b) => { await patch(E.id, { hook: Number(b.dataset.hook), hookText: '' }); repaint(false, 0); panel(); });
  on(root, 'input', '[data-f]', onInput);
  on(root, 'click', '[data-preset]', (b) => setLook({ preset: b.dataset.preset }).then(panel));
  on(root, 'click', '[data-accent]', (b) => setLook({ accent: b.dataset.accent }).then(panel));
  on(root, 'input', 'input[type="range"][data-look]', (i) => { i.previousElementSibling.querySelector('em').textContent = Math.round(i.value * 100); setLook({ [i.dataset.look]: Number(i.value) }); });
  on(root, 'change', 'input[type="checkbox"][data-look]', (i) => setLook({ [i.dataset.look]: i.checked }));
  on(root, 'change', 'input[data-slot]', (i) => { if (i.files?.[0]) addPicture(i.dataset.slot, i.files[0]); });
  on(root, 'click', '[data-unslot]', (b) => removePicture(b.dataset.unslot));
  // while typing, keep a small live slide pinned above the keyboard
  root.addEventListener('focusin', (e) => { if (e.target.matches('textarea, input[type="text"]')) $('.editor', root)?.classList.add('typing'); });
  root.addEventListener('focusout', () => setTimeout(() => { if (E && !(root.contains(document.activeElement) && document.activeElement.matches('textarea, input[type="text"]'))) $('.editor', root)?.classList.remove('typing'); }, 80));
}
export function navigate([id, tab]) { if (!E || id !== E.id) return false; if (TABS.some((t) => t[0] === tab) && tab !== E.tab) { E.tab = tab; panel(); } return true; }
export function update() { if (E?.root.isConnected) { head(); bar(); } }
export function destroy() { clearTimeout(paintTimer); E = null; }
