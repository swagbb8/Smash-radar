// Small DOM helpers shared by every view.
export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Event delegation: on(root, 'click', '[data-x]', (el, event) => …) */
export function on(root, type, sel, fn) { root.addEventListener(type, (e) => { const el = e.target.closest(sel); if (el && root.contains(el)) fn(el, e); }); }

let toastTimer;
export function toast(msg, ms = 2400) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), ms); }

export function sheet(html, onOpen) {
  const s = $('#sheet'); $('#sheet-body').innerHTML = html; s.hidden = false; document.body.style.overflow = 'hidden';
  const close = () => { s.hidden = true; document.body.style.overflow = ''; s.removeEventListener('click', onClick); };
  const onClick = (e) => { if (e.target.closest('[data-close]')) close(); };
  s.addEventListener('click', onClick); if (onOpen) onOpen($('#sheet-body'), close); return close;
}

export const fmtDate = (iso, o = { month: 'short', day: 'numeric' }) => { try { return new Date(iso).toLocaleDateString(undefined, o); } catch { return ''; } };
export function ago(iso) {
  if (!iso) return 'never'; const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 90) return 'just now'; if (s < 3600) return `${Math.round(s / 60)} min ago`; if (s < 86400) return `${Math.round(s / 3600)} h ago`; return `${Math.round(s / 86400)} d ago`;
}
export const ymd = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const SERIES = { uncomfortable: 'The uncomfortable truth', hijacked: 'Your brain is being hijacked', unseen: 'The world you don’t see', darkside: 'The dark side of modern life', reality: 'Reality check', future: 'The future is closer than you think', think: 'Think about this' };
export const SUBJECTS = { psychology: 'Psychology', technology: 'Technology', brain: 'The brain', social: 'Social media', society: 'Society', relationships: 'Relationships', health: 'Health', science: 'Science', money: 'Money and power', future: 'The future', history: 'History' };
export const STATUS = { new: 'New', draft: 'Draft', approved: 'Approved', scheduled: 'Scheduled', posted: 'Posted', skipped: 'Skipped' };
export const LEVELS = { established: { label: 'Established', dots: 3, note: 'Many studies combined, or official data' }, supported: { label: 'Supported', dots: 2, note: 'At least one solid peer-reviewed study' }, emerging: { label: 'Emerging', dots: 1, note: 'Early, small or not yet peer reviewed' }, interpretation: { label: 'Interpretation', dots: 0, note: 'Our reading of the evidence' } };
export const dots = (n) => `<span class="dots" aria-hidden="true">${[0, 1, 2].map((i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
export const stamp = (status) => `<span class="stamp ${esc(status)}">${esc(STATUS[status] || status)}</span>`;

/** The engine's reasons, said the way a person would say them. */
export function plain(reason) {
  const r = String(reason || ''); let m;
  if ((m = r.match(/only (\d+) relevant source/))) return `Only ${m[1] === '0' ? 'no' : m[1]} solid stud${m[1] === '1' ? 'y' : 'ies'} turned up. A file needs at least two.`.replace('Only no', 'No');
  if ((m = r.match(/only (\d+) claim/))) return `Only ${m[1]} claim could be proven word for word. A file needs at least two.`.replace('Only 0 claim', 'No claim');
  if (/search services unavailable/.test(r)) return 'The research databases did not answer. The topic stays in line.';
  if (/evidence extraction failed|writing failed/.test(r)) return 'The writer did not finish. The topic will be tried again.';
  if (/^unfixable/.test(r)) return 'The draft kept something that could not be proven, so it was thrown away.';
  if (/^crash/.test(r)) return 'The engine hit an error on this one.';
  return r ? r.charAt(0).toUpperCase() + r.slice(1) : '';
}
export const writerName = (m) => ({ 'gemma-4-12b': 'Gemma 4', 'gpt-oss-20b': 'gpt-oss 20B' }[m] || m || 'the AI writer');
