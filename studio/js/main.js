// Studio entry: boot the state, route between views, keep the tab thread and the engine light honest.
import { $, $$, ago } from './ui.js';
import { S, boot, subscribe, refresh } from './state.js';
import { fontsReady } from './render.js';
import * as today from './views/today.js';
import * as files from './views/files.js';
import * as post from './views/post.js';
import * as research from './views/research.js';
import * as plan from './views/plan.js';
import * as money from './views/money.js';
import * as settings from './views/settings.js';

const VIEWS = { today, files, post, research, plan, money, settings };
const TAB = { today: 0, files: 1, post: 1, research: 2, plan: 3, money: 4 };
const TAB_NAMES = ['today', 'files', 'research', 'plan', 'money'];
const scrolls = new Map();
let live = null, lastHash = '', seq = 0;

function parse() { const [name = 'today', ...rest] = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent); return { name: VIEWS[name] ? name : 'today', rest }; }

async function route() {
  const { name, rest } = parse(); const my = ++seq; const root = $('#view');
  if (lastHash) scrolls.set(lastHash, window.scrollY);
  // same view, deeper address (a tab inside the editor): let the view handle it without a rebuild
  if (live && live.name === name && live.view.navigate && live.view.navigate(rest)) { lastHash = location.hash; return; }
  try { live?.view.destroy?.(); } catch (e) { console.warn(e); }
  root.innerHTML = ''; root.className = 'view-' + name;
  if (name in TAB) { $('.tabs').style.setProperty('--tab', TAB[name]); $$('.tabs a').forEach((a) => (a.dataset.tab === TAB_NAMES[TAB[name]] ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'))); }
  else $$('.tabs a').forEach((a) => a.removeAttribute('aria-current'));
  $('.tabs').classList.toggle('no-tab', !(name in TAB));
  live = { name, view: VIEWS[name] };
  const el = document.createElement('div'); root.appendChild(el);                // a fresh node per visit, so a view's listeners die with it
  try { await VIEWS[name].mount(el, rest); } catch (e) { console.error(e); if (my === seq) root.innerHTML = `<div class="wrap"><div class="empty"><h2 class="title">This screen hit a problem</h2><p>${String(e.message || e).replace(/</g, '&lt;')}</p><p style="margin-top:16px"><a class="btn" href="#/today">Back to today</a></p></div></div>`; }
  if (my !== seq) return;
  lastHash = location.hash; window.scrollTo(0, scrolls.get(lastHash) || 0);
}

function engineLight() {
  const run = S.engine.runs?.[0]; const dot = $('#engine-dot'); if (!dot) return;
  const fresh = run && Date.now() - new Date(run.at).getTime() < 30 * 3600e3;
  dot.classList.toggle('ok', !!fresh); dot.title = run ? `Engine last ran ${ago(run.at)}` : 'The engine has not run yet';
}

async function start() {
  await Promise.all([boot(), fontsReady()]);
  subscribe(() => { engineLight(); live?.view.update?.(); });
  engineLight(); window.addEventListener('hashchange', route); await route();
  // fresh engine data whenever the app comes back to the front
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh().catch(() => {}); });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('../sw.js', { scope: '../', updateViaCache: 'none' }).then(() => navigator.serviceWorker.ready).then((reg) => {
      reg.active?.postMessage({ warm: [location.href.split('#')[0], ...performance.getEntriesByType('resource').map((r) => r.name)] });
    }).catch(() => {});
  }
}
start().catch((e) => { console.error(e); $('#view').innerHTML = `<div class="wrap"><div class="empty"><h2 class="title">The studio could not start</h2><p>${String(e.message || e).replace(/</g, '&lt;')}</p></div></div>`; });
