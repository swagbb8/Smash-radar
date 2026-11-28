// Today: one file, one thing to do. Everything else on the page is a number or a single tap.
import { $, esc, on, toast, ago, ymd, SUBJECTS, LEVELS, dots, writerName } from '../ui.js';
import { S, local, statusOf, patch, waiting, take, byStatus, scheduledOn, counts, refresh } from '../state.js';
import { loadPost } from '../data.js';
import { drawSlide } from '../render.js';
import { themeOf } from '../export.js';
import { ask } from '../engine.js';
import { openShare } from './share.js';
import { seriesOf, fileNo, askSheet, minutesPerFile } from './common.js';

let root;
const HEAD = { due: 'Post this today', late: 'Overdue', ready: 'Ready to post', review: 'Check this file', fresh: 'New file' };

/** What deserves attention first. */
function focus() {
  const today = ymd(); const sched = byStatus('scheduled').map((p) => ({ p, d: local(p.id).date || '' })).sort((a, b) => a.d.localeCompare(b.d));
  const due = sched.find((x) => x.d === today); if (due) return { kind: 'due', p: due.p };
  const late = sched.find((x) => x.d && x.d < today); if (late) return { kind: 'late', p: late.p };
  const postedToday = scheduledOn(today).filter((p) => statusOf(p.id) === 'posted').length; const approved = byStatus('approved');
  if (approved.length && postedToday < (S.settings.perDay || 1)) return { kind: 'ready', p: approved[approved.length - 1] };
  const drafts = byStatus('draft').sort((a, b) => (local(a.id).taken || '').localeCompare(local(b.id).taken || '')); if (drafts.length) return { kind: 'review', p: drafts[0] };
  const w = waiting(); if (w.length) return { kind: 'fresh', p: w[0] };
  return { kind: S.index.posts.length ? 'clear' : 'empty', postedToday };
}

function engineLine() {
  const run = S.engine.runs?.[0]; if (!run) return 'The engine has not finished a run yet.';
  const w = S.engine.writer?.model ? ` Writer: ${esc(writerName(S.engine.writer.model))}${S.engine.writer.free ? ', free' : ''}.` : '';
  return `The engine last ran ${ago(run.at)} and made ${run.made} file${run.made === 1 ? '' : 's'}.${w}`;
}

function render() {
  const f = focus(); const c = counts(); const wait = c.new; const p = f.p;
  let hero;
  if (p) {
    const st = statusOf(p.id); const done = ['approved', 'scheduled', 'posted'].includes(st) ? 4 : 3; const lv = LEVELS[p.best] || LEVELS.supported; const sharing = f.kind === 'due' || f.kind === 'late' || f.kind === 'ready';
    hero = `<div class="hero">
      <a class="hero-slide" href="#/post/${encodeURIComponent(p.id)}" aria-label="Open file ${fileNo(p)}"><canvas id="hero-canvas" width="1080" height="1350"></canvas></a>
      <div>
        <h1 class="display">${esc(HEAD[f.kind])}</h1>
        <p class="lede">${esc(seriesOf(p))}, file ${fileNo(p)}</p>
        <div class="facts"><span>${dots(lv.dots)} ${esc(lv.label)}</span><span>${p.sources} source${p.sources === 1 ? '' : 's'}</span><span>${esc(SUBJECTS[p.subject] || p.subject)}</span></div>
        <div class="steps" style="--done:${done - 1}"><div class="done">Researched</div><div class="done">Written</div><div class="done">Checked</div><div class="${done === 4 ? 'done' : ''}">Approved</div></div>
        <div class="btn-row" style="margin-top:22px">${sharing ? `<button class="btn primary" data-share="${esc(p.id)}">Share</button><a class="btn" href="#/post/${encodeURIComponent(p.id)}">Open file</a>` : `<a class="btn primary" href="#/post/${encodeURIComponent(p.id)}">Open file</a><button class="btn" data-skip="${esc(p.id)}">Skip it</button>`}</div>
      </div>
    </div>`;
  } else if (f.kind === 'clear') {
    hero = `<div class="empty"><h1 class="display">All caught up</h1><p class="read" style="margin-top:14px">${f.postedToday ? 'Today’s post is out. ' : ''}Nothing is waiting for you. New files arrive after the next engine run.</p></div>`;
  } else {
    hero = `<div class="empty"><h1 class="display">First files are on the way</h1><p class="read" style="margin-top:14px">The engine researches, checks and writes each file on its own. One file takes about ${minutesPerFile()} minutes. Come back in a bit and pull down to refresh.</p><p style="margin-top:18px"><button class="btn" data-refresh>Check again</button></p></div>`;
  }
  root.innerHTML = `<div class="wrap">${hero}
    <section class="section"><span class="label">Make posts</span>
      <div class="gen">${[1, 5, 10, 20].map((n) => `<button class="btn" data-take="${n}">${n}</button>`).join('')}</div>
      <p class="quiet small" style="margin-top:10px">${wait ? `${wait} finished file${wait === 1 ? ' is' : 's are'} waiting. Tap a number to pull that many into your drafts.` : 'No finished files are waiting right now. Tap a number to order more from the engine.'}</p>
    </section>
    <section class="section"><div class="figures">
      <a href="#/files/all"><b>${S.index.posts.length}</b><span>In the library</span></a><a href="#/files/draft"><b>${c.draft}</b><span>Drafts</span></a>
      <a href="#/files/approved"><b>${c.approved + c.scheduled}</b><span>Ready to post</span></a><a href="#/files/posted"><b>${c.posted}</b><span>Posted</span></a></div></section>
    <section class="section"><p class="quiet small">${engineLine()} <a class="link" href="#/settings">Engine status</a></p></section>
  </div>`;
  if (p) loadPost(p.id).then((post) => { const cv = $('#hero-canvas', root); if (post && cv) return drawSlide(cv, post, themeOf(), local(p.id), 0); }).catch((e) => console.warn(e));
}

async function order(n, got) {
  const need = n - got; const mins = minutesPerFile() * need; const time = mins >= 90 ? `about ${Math.round(mins / 60)} hours` : `about ${mins} minutes`;
  askSheet({ title: got ? `${got} pulled. Order ${need} more?` : `Order ${need} new file${need === 1 ? '' : 's'}`, href: await ask.make(need), button: `Order ${need} from the engine`,
    lines: [`${got ? `Only ${got} finished file${got === 1 ? ' was' : 's were'} waiting. ` : ''}The engine can research and write ${need} more. On the free writer that takes ${time}; you do not have to keep the app open.`] });
}

export async function mount(el) {
  root = el; render();
  on(root, 'click', '[data-take]', async (b) => { const n = Number(b.dataset.take); const ids = await take(n); if (ids.length) toast(`${ids.length} file${ids.length === 1 ? '' : 's'} moved to your drafts`); if (ids.length < n) order(n, ids.length); else if (n > 1) location.hash = '#/files/draft'; });
  on(root, 'click', '[data-skip]', async (b) => { await patch(b.dataset.skip, { status: 'skipped' }); toast('Skipped. It stays in the library.'); });
  on(root, 'click', '[data-share]', async (b) => { const post = await loadPost(b.dataset.share); if (post) openShare(post); });
  on(root, 'click', '[data-refresh]', async () => { const changed = await refresh(); toast(changed ? 'New files arrived' : 'Nothing new yet'); });
}
export function update() { if (root?.isConnected) render(); }
export function destroy() { root = null; }
