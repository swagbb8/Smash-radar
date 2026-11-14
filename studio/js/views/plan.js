// Plan: a month at a glance. Approved files go on days; on the day, Today puts that file first with a Share button.
import { $, esc, on, toast, sheet, ymd, fmtDate } from '../ui.js';
import { S, local, statusOf, patch, byStatus, scheduledOn, autoPlan, saveSettings } from '../state.js';
import { asset } from '../data.js';
import { thumbImg, upgradeThumbs, fileNo } from './common.js';

let root; const now = new Date(); const M = { y: now.getFullYear(), m: now.getMonth() };
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const dayLabel = (d) => fmtDate(d + 'T12:00', { weekday: 'long', month: 'long', day: 'numeric' });

function render() {
  const first = new Date(M.y, M.m, 1); const start = new Date(M.y, M.m, 1 - first.getDay()); const last = new Date(M.y, M.m + 1, 0); const weeks = Math.ceil((first.getDay() + last.getDate()) / 7); const today = ymd();
  let cells = '';
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i); const key = ymd(d); const posts = scheduledOn(key); const out = d.getMonth() !== M.m;
    cells += `<button class="${key === today ? 'today' : ''}${out ? ' out' : ''}${key < today ? ' past' : ''}" data-day="${key}" aria-label="${esc(dayLabel(key))}${posts.length ? `, ${posts.length} file${posts.length === 1 ? '' : 's'}` : ''}"><span>${d.getDate()}</span>${posts[0] ? thumbImg(posts[0], '') : ''}${posts.length > 1 ? `<b class="n">${posts.length}</b>` : ''}${posts.some((p) => statusOf(p.id) === 'posted') ? '<i class="tick" aria-hidden="true"></i>' : ''}</button>`;
  }
  const loose = byStatus('approved').length; const per = S.settings.perDay || 1;
  const soon = byStatus('scheduled').map((p) => ({ p, d: local(p.id).date || '' })).filter((x) => x.d >= today).sort((a, b) => a.d.localeCompare(b.d)).slice(0, 6);
  root.innerHTML = `<div class="wrap">
    <div class="row between section"><h1 class="title">${first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h1><div class="row"><button class="btn small-btn" data-move="-1" aria-label="Previous month">Back</button><button class="btn small-btn" data-move="1" aria-label="Next month">Next</button></div></div>
    <div class="cal" style="margin-top:14px">${DOW.map((d) => `<div class="dow">${d}</div>`).join('')}${cells}</div>
    <section class="section">
      <button class="btn primary block" id="pl-auto" ${loose ? '' : 'disabled'}>${loose ? `Put my ${loose} approved file${loose === 1 ? '' : 's'} on the calendar` : 'No approved files to plan'}</button>
      <div class="row between" style="margin-top:16px"><span class="quiet">Posts a day</span><div class="pick">${[1, 2, 3].map((n) => `<button data-per="${n}" aria-pressed="${per === n}">${n}</button>`).join('')}</div></div>
    </section>
    <section class="section"><span class="label">Coming up</span>
      ${soon.length ? `<div class="list">${soon.map(({ p, d }) => `<a href="#/post/${encodeURIComponent(p.id)}"><img class="mini" src="${esc(asset(p.thumb))}" data-thumb="${esc(p.id)}" alt=""><div class="grow"><h3>${esc(d === today ? 'Today' : dayLabel(d))}</h3><p>${esc(local(p.id).hookText || p.hook || p.title)}</p></div></a>`).join('')}</div>` : '<p class="quiet">Nothing is planned. Approve a file, then plan it here.</p>'}
    </section>
    <section class="section"><span class="label">A nudge every day</span>
      <p class="quiet" style="margin-bottom:12px">The studio cannot send notifications. Add a repeating reminder to your phone’s calendar instead; it opens the studio.</p>
      <div class="pick wide">${[['09', '9 am'], ['12', 'Noon'], ['18', '6 pm'], ['20', '8 pm']].map(([h, n]) => `<a href="${esc(asset('studio/reminder-' + h + '.ics'))}">${n}</a>`).join('')}</div>
    </section></div>`;
  upgradeThumbs(root);
}

function daySheet(day) {
  const here = scheduledOn(day); const free = byStatus('approved'); const past = day < ymd();
  sheet(`<h2 class="title">${esc(dayLabel(day))}</h2>
    ${here.length ? `<div class="list">${here.map((p) => `<div><img class="mini" src="${esc(asset(p.thumb))}" alt=""><div class="grow"><h3>No. ${fileNo(p)}${statusOf(p.id) === 'posted' ? ', posted' : ''}</h3><p>${esc(local(p.id).hookText || p.hook || p.title)}</p><div class="row" style="margin-top:8px"><a class="btn small-btn" href="#/post/${encodeURIComponent(p.id)}" data-close>Open</a>${statusOf(p.id) === 'scheduled' ? `<button class="btn ghost small-btn" data-off="${esc(p.id)}">Take off</button>` : ''}</div></div></div>`).join('')}</div>` : `<p class="quiet" style="margin-top:10px">Nothing on this day.</p>`}
    ${past ? '' : `<span class="label" style="display:block;margin-top:22px">Put a file here</span>${free.length ? `<div class="list">${free.map((p) => `<button data-put="${esc(p.id)}"><img class="mini" src="${esc(asset(p.thumb))}" alt=""><div class="grow"><h3>No. ${fileNo(p)}</h3><p>${esc(local(p.id).hookText || p.hook || p.title)}</p></div></button>`).join('')}</div>` : '<p class="quiet" style="margin-top:8px">No approved files are free. Approve one first.</p>'}`}`, (body, close) => {
    on(body, 'click', '[data-put]', async (b) => { await patch(b.dataset.put, { status: 'scheduled', date: day }); close(); toast('Planned'); });
    on(body, 'click', '[data-off]', async (b) => { await patch(b.dataset.off, { status: 'approved', date: null }); close(); });
  });
}

export async function mount(el) {
  root = el; render();
  on(root, 'click', '[data-move]', (b) => { const d = new Date(M.y, M.m + Number(b.dataset.move), 1); M.y = d.getFullYear(); M.m = d.getMonth(); render(); });
  on(root, 'click', '[data-day]', (b) => daySheet(b.dataset.day));
  on(root, 'click', '#pl-auto', async () => { const n = await autoPlan(); toast(`${n} file${n === 1 ? '' : 's'} planned, ${S.settings.perDay || 1} a day`); });
  on(root, 'click', '[data-per]', (b) => saveSettings({ perDay: Number(b.dataset.per) }));
}
export function update() { if (root?.isConnected) render(); }
export function destroy() { root = null; }
