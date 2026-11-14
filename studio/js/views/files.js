// Files: every post the engine has made, filtered by where it stands and what it is about.
import { $, esc, on, SUBJECTS, STATUS } from '../ui.js';
import { S, statusOf, counts, local } from '../state.js';
import { card, upgradeThumbs } from './common.js';

let root; const F = { status: 'all', subject: '', q: '' };
const ORDER = ['all', 'new', 'draft', 'approved', 'scheduled', 'posted', 'skipped'];
const NAMES = { all: 'All', ...STATUS, draft: 'Drafts' };
const EMPTY = { all: 'The library is empty. The engine is still working on the first files.', new: 'No new files right now.', draft: 'No drafts. Pull files in from Today.', approved: 'Nothing approved yet. Open a draft and approve it.', scheduled: 'Nothing on the calendar yet.', posted: 'Nothing posted yet.', skipped: 'You have not skipped anything.' };

function list() {
  const q = F.q.trim().toLowerCase();
  return S.index.posts.filter((p) => (F.status === 'all' || statusOf(p.id) === F.status) && (!F.subject || p.subject === F.subject) && (!q || `${p.hook} ${p.title} ${p.topic} ${local(p.id).hookText || ''}`.toLowerCase().includes(q)));
}
function grid() {
  const items = list(); const g = $('#files-grid', root); if (!g) return;
  g.innerHTML = items.length ? `<div class="grid">${items.map(card).join('')}</div>` : `<div class="empty"><p>${esc(F.q || F.subject ? 'No files match that.' : EMPTY[F.status])}</p></div>`;
  upgradeThumbs(g);
}
function render() {
  const c = counts(); c.all = S.index.posts.length; const subjects = [...new Set(S.index.posts.map((p) => p.subject))].filter((s) => SUBJECTS[s]);
  root.innerHTML = `<div class="wrap">
    <div class="section"><div class="chips" role="group" aria-label="Filter by status">${ORDER.map((k) => `<button class="chip" data-status="${k}" aria-pressed="${F.status === k}">${NAMES[k]}${c[k] ? ` <b>${c[k]}</b>` : ''}</button>`).join('')}</div></div>
    <div class="filters">
      <label class="field"><span>Find</span><input type="text" id="files-q" value="${esc(F.q)}" placeholder="A word from the headline" autocomplete="off"></label>
      <label class="field"><span>Subject</span><select id="files-subject"><option value="">Every subject</option>${subjects.map((s) => `<option value="${s}"${F.subject === s ? ' selected' : ''}>${esc(SUBJECTS[s])}</option>`).join('')}</select></label>
    </div>
    <div id="files-grid" class="section"></div></div>`;
  grid();
}

export async function mount(el, rest) {
  root = el; if (ORDER.includes(rest[0])) F.status = rest[0]; render();
  on(root, 'click', '[data-status]', (b) => { F.status = b.dataset.status; history.replaceState(null, '', '#/files/' + F.status); for (const x of root.querySelectorAll('[data-status]')) x.setAttribute('aria-pressed', x === b); grid(); });
  on(root, 'input', '#files-q', (i) => { F.q = i.value; grid(); });
  on(root, 'change', '#files-subject', (s) => { F.subject = s.value; grid(); });
}
export function navigate(rest) { if (!root?.isConnected) return false; if (ORDER.includes(rest[0])) F.status = rest[0]; render(); return true; }
export function update() { if (root?.isConnected) render(); }
export function destroy() { root = null; }
