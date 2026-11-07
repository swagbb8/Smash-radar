// Pieces several views share: cover thumbnails, file cards, the "ask the engine" sheet.
import { esc, stamp, sheet, SERIES } from '../ui.js';
import { S, local, statusOf } from '../state.js';
import { loadPost, asset } from '../data.js';
import { thumbUrl } from '../render.js';
import { themeOf, lookKey } from '../export.js';

/** Does this file look different here than the cover the engine drew? (own look, picked hook, own picture) */
export function customLook(id) { const l = local(id); return lookKey() !== '{}' || l.hook != null || !!l.hookText || !!l.theme || !!l.uploads || !!l.noImage; }

export const fileNo = (p) => String(p.n ?? 0).padStart(4, '0');
export const thumbImg = (p, cls = 'thumb') => `<img class="${cls}" src="${esc(asset(p.thumb))}" data-thumb="${esc(p.id)}" alt="" loading="lazy" width="432" height="540">`;
export const card = (p) => `<a class="card" href="#/post/${encodeURIComponent(p.id)}">${thumbImg(p)}<div class="meta">${stamp(statusOf(p.id))}<span>No. ${fileNo(p)}</span></div><div class="name">${esc(local(p.id).hookText || p.hook || p.title)}</div></a>`;

let io;
/** Swap engine-drawn covers for locally drawn ones where the look differs — only for cards on screen. */
export function upgradeThumbs(root) {
  io?.disconnect();
  io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue; io.unobserve(e.target); const id = e.target.dataset.thumb;
      loadPost(id).then((post) => post && thumbUrl(post, themeOf(), local(id), lookKey() + (local(id).touched || ''))).then((url) => { if (url && e.target.isConnected) e.target.src = url; }).catch(() => {});
    }
  }, { rootMargin: '300px' });
  for (const img of root.querySelectorAll('img[data-thumb]')) if (customLook(img.dataset.thumb)) io.observe(img);
}

export const seriesOf = (p) => SERIES[p.style] || 'The Truth';
export const minutesPerFile = () => { const runs = (S.engine.runs || []).filter((r) => r.made > 0); if (!runs.length) return 14; const s = runs.slice(0, 6).reduce((n, r) => n + r.seconds / r.made, 0) / Math.min(6, runs.length); return Math.max(4, Math.round(s / 60)); };

/** The engine cannot be started from here without a key in the browser. Explain once, plainly, and hand over the link. */
export function askSheet({ title, lines = [], href, button = 'Open GitHub' }) {
  return sheet(`<h2 class="title">${esc(title)}</h2>${lines.map((l) => `<p class="read" style="margin-top:12px">${l}</p>`).join('')}
    <div class="steps-list"><p><b>1</b> Tap the button below. GitHub opens with the request already written.</p><p><b>2</b> Tap the green <i>Submit new issue</i> button.</p><p><b>3</b> Done. The engine starts by itself.</p></div>
    <a class="btn primary block" style="margin-top:18px" href="${esc(href)}" target="_blank" rel="noopener">${esc(button)}</a>
    <p class="quiet small" style="margin-top:12px">You need to be signed in to GitHub as the owner of this project. The engine ignores requests from anyone else.</p>`);
}
