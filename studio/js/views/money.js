// Money: the ways this brand can earn, what each one needs from Ash, and a log of what actually came in.
// Nothing here pretends to be connected. A stream is "on" only when its link or ID has reached the engine.
import { $, $$, esc, on, toast, sheet, ymd, fmtDate, SERIES, SUBJECTS } from '../ui.js';
import { S, local, saveSettings, byStatus } from '../state.js';
import { asset } from '../data.js';
import { ask } from '../engine.js';
import { askSheet } from './common.js';
import { wanted, unsent } from '../config.js';

let root;
const isUrl = (v) => /^https:\/\/[^\s<>"']{4,200}$/.test(v);
export const STREAMS = [
  { key: 'tips', name: 'Tips and memberships', what: 'A “Support the research” button on every article and on your link page.', field: 'Your Ko-fi or Buy Me a Coffee link', hint: 'https://ko-fi.com/yourname', ok: isUrl,
    steps: ['Make a free page at ko-fi.com (it keeps 0% of tips) or buymeacoffee.com.', 'Paste the link to your page below.', 'Send it to the engine. The button appears on the website by itself.'] },
  { key: 'amazon', name: 'Book links', what: 'Each article ends with books on its subject. When a reader buys through the link, Amazon pays you a small cut.', field: 'Your Amazon Associates tag', hint: 'yourname-20', ok: (v) => /^[a-z0-9][a-z0-9-]{1,30}-2\d$/i.test(v),
    steps: ['Join Amazon Associates (free) and list your website.', 'Paste your tracking tag below. It ends in -20.', 'Amazon closes accounts that make no sales in the first 180 days, so join once people are reading.'] },
  { key: 'adsense', name: 'Ads on the website', what: 'Google places ads in the articles and pays per view and click.', field: 'Your AdSense publisher ID', hint: 'ca-pub-0000000000000000', ok: (v) => /^ca-pub-\d{10,20}$/.test(v),
    steps: ['Google only accepts sites on their own domain. Buy one (about $12 a year) and add it under Settings.', 'Apply at adsense.google.com. Approval takes days to weeks and needs a good number of articles.', 'Paste your publisher ID below.'] },
  { key: 'product', name: 'Something to sell', what: 'A “Get the collection” button on the website that links to a product of yours.', field: 'Link to your product page', hint: 'https://yourname.gumroad.com/l/truth', ok: isUrl,
    steps: ['Make a product on Gumroad or Ko-fi Shop: a PDF of your best files, a print, anything you own.', 'Paste the product link below.', 'The app does not make the product for you yet. A monthly collection PDF is planned, not built.'] },
  { key: 'newsletter', name: 'Email briefing', what: 'A sign-up button on the website. A list you own is the one audience no algorithm can take away.', field: 'Link to your sign-up page', hint: 'https://yourname.beehiiv.com/subscribe', ok: isUrl,
    steps: ['Start a free newsletter (beehiiv, Substack or Buttondown).', 'Paste its sign-up link below.', 'The website publishes a feed of every new file that those services can send out for you.'] },
];
const SOURCES = { tips: 'Tips', books: 'Book links', ads: 'Ads', product: 'Collection', deal: 'Brand deal', other: 'Other' };
const money = (n) => (n || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: n % 1 ? 2 : 0 });

const mine = () => S.settings.money || {};
const live = () => S.config.money || {};
function works() {
  const posted = byStatus('posted').map((p) => ({ p, m: local(p.id).metrics })).filter((x) => x.m && (x.m.reach || x.m.likes || x.m.saves || x.m.shares));
  if (posted.length < 3) return `<p class="quiet">Log the numbers for at least three posted files (open a posted file, tap “Log results”) and this shows which kinds of post to make more of. ${posted.length} logged so far.</p>`;
  const rate = (m) => { const act = (m.saves || 0) * 2 + (m.shares || 0) * 2 + (m.comments || 0) + (m.likes || 0) * 0.5; return m.reach ? (act / m.reach) * 100 : act; };
  const group = (keyOf, names) => { const g = {}; for (const x of posted) { const k = keyOf(x.p); if (!k) continue; (g[k] ||= []).push(rate(x.m)); } return Object.entries(g).map(([k, v]) => ({ name: names[k] || k, n: v.length, score: v.reduce((a, b) => a + b, 0) / v.length })).sort((a, b) => b.score - a.score); };
  const block = (title, rows) => { const max = Math.max(0.0001, ...rows.map((r) => r.score)); return rows.length ? `<p class="quiet small" style="margin:14px 0 8px">${title}</p><div class="bars">${rows.slice(0, 5).map((r) => `<div class="b"><span>${esc(r.name)}</span><i style="width:${(r.score / max) * 100}%"></i><span>${r.n}</span></div>`).join('')}</div>` : ''; };
  return `${block('By series', group((p) => p.style, SERIES))}${block('By subject', group((p) => p.subject, SUBJECTS))}${block('By kind of opening line', group((p) => p.hookType, { question: 'Question', contradiction: 'Contradiction', accusation: 'Accusation', scene: 'Scene', number: 'Number', statement: 'Statement' }))}
    <p class="quiet small" style="margin-top:12px">Longer bar = more saves, shares and comments for every person reached. The number is how many posts it is based on.</p>`;
}

function render() {
  const earn = S.settings.earnings || []; const total = earn.reduce((n, e) => n + (e.amount || 0), 0); const month = ymd().slice(0, 7); const thisMonth = earn.filter((e) => (e.date || '').startsWith(month)).reduce((n, e) => n + (e.amount || 0), 0);
  const site = !!S.version?.site; const handle = S.settings.handle || S.config.handle || ''; const books = S.engine.collections || []; const fol = S.settings.followers || []; const pending = unsent();
  root.innerHTML = `<div class="wrap">
    <section class="section"><p class="label">Earned so far</p><p class="display" style="margin-top:6px">${money(total)}</p>
      <p class="quiet" style="margin-top:8px">${earn.length ? `${money(thisMonth)} this month.` : 'Nothing logged yet. The studio cannot see your payouts, so add them here when they arrive.'}</p>
      <div class="btn-row" style="margin-top:14px"><button class="btn" id="mn-log">Log money that came in</button></div></section>
    <section class="section"><span class="label">Ways this can earn</span>
      <div class="note">The app does not make money by itself. It builds the page, the website and the products. Money starts when these are switched on and people show up. Each account below has to be yours, and its owner has to be 18 or older.</div>
      <div class="list">
        <button data-stream="handle"><i class="lamp ${handle ? 'on' : ''}"></i><div class="grow"><h3>Your Instagram page</h3><p>${handle ? '@' + esc(handle.replace(/^@/, '')) + '. Printed on the last slide of every post.' : 'Where the audience comes from. Add the account name so it is printed on every post.'}</p></div></button>
        ${site ? `<a href="${esc(S.config.site || asset(''))}" target="_blank" rel="noopener"><i class="lamp on"></i><div class="grow"><h3>The website</h3><p>Every file is published as a full article with its sources. Tap to open it.</p></div></a>` : `<div><i class="lamp"></i><div class="grow"><h3>The website</h3><p>Not built yet. It will publish every file as a full article with its sources; tips, book links, ads, the monthly collection and the email sign-up all switch on from here once it exists.</p></div></div>`}
        ${site ? STREAMS.map((s) => { const v = mine()[s.key] ?? live()[s.key] ?? ''; const on = !!live()[s.key] && live()[s.key] === v; return `<button data-stream="${s.key}"><i class="lamp ${on ? 'on' : v ? 'half' : ''}"></i><div class="grow"><h3>${s.name}</h3><p>${on ? 'On. ' : v ? 'Saved here, not sent to the engine yet. ' : ''}${s.what}</p></div></button>`; }).join('') : ''}
      </div>
      ${pending ? '<button class="btn primary block" id="mn-send" style="margin-top:8px">Send my changes to the engine</button>' : ''}
    </section>
    ${books.length ? `<section class="section"><span class="label">Collections to sell</span><div class="list">${books.map((b) => `<a href="${esc(asset(b.file))}" target="_blank" rel="noopener"><div class="grow"><h3>${esc(b.title)}</h3><p>${b.files} files, ${b.pages} pages, ${(b.bytes / 1e6).toFixed(1)} MB. Tap to download the PDF.</p></div></a>`).join('')}</div></section>` : ''}
    <section class="section"><span class="label">What works</span>${works()}</section>
    <section class="section"><span class="label">Followers</span>
      ${fol.length ? `<div class="spark">${fol.slice(-12).map((f) => { const max = Math.max(...fol.slice(-12).map((x) => x.n), 1); return `<i style="height:${Math.max(4, (f.n / max) * 100)}%" title="${esc(f.date)}: ${f.n}"></i>`; }).join('')}</div><p class="quiet small" style="margin-top:8px">${fol[fol.length - 1].n.toLocaleString()} on ${esc(fmtDate(fol[fol.length - 1].date + 'T12:00'))}${fol.length > 1 ? `, ${fol[fol.length - 1].n - fol[0].n >= 0 ? 'up' : 'down'} ${Math.abs(fol[fol.length - 1].n - fol[0].n).toLocaleString()} since ${esc(fmtDate(fol[0].date + 'T12:00'))}` : ''}.</p>` : '<p class="quiet">Type your follower count now and then, and the studio draws the trend.</p>'}
      <div class="pair" style="margin-top:6px"><label class="field"><span>Followers today</span><input type="number" inputmode="numeric" min="0" id="mn-fol"></label><div class="field"><span>&nbsp;</span><button class="btn block" id="mn-fol-save">Save</button></div></div>
    </section>
    ${earn.length ? `<section class="section"><span class="label">Money log</span><div class="list">${earn.slice().reverse().slice(0, 20).map((e) => `<div><div class="grow"><h3>${money(e.amount)}</h3><p>${esc(SOURCES[e.source] || e.source)}, ${esc(fmtDate(e.date + 'T12:00', { month: 'short', day: 'numeric', year: 'numeric' }))}</p></div><button class="btn ghost small-btn" data-unlog="${esc(e.id)}">Remove</button></div>`).join('')}</div></section>` : ''}
  </div>`;
}

function streamSheet(key) {
  if (key === 'handle') {
    return sheet(`<h2 class="title">Your Instagram page</h2><p class="read" style="margin-top:10px">Only the account name. The studio never asks for a password and never logs in for you.</p>
      <label class="field"><span>Account name</span><input type="text" id="st-val" value="${esc(S.settings.handle || S.config.handle || '')}" placeholder="thetruth.files" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
      <button class="btn primary block" id="st-save" style="margin-top:16px">Save</button>`, (body, close) => { $('#st-save', body).onclick = async () => { const v = $('#st-val', body).value.replace(/^@/, '').trim(); if (v && !/^[a-z0-9._]{1,30}$/i.test(v)) return toast('That does not look like an Instagram name'); await saveSettings({ handle: v }); close(); toast('Saved'); }; });
  }
  const s = STREAMS.find((x) => x.key === key); const v = mine()[key] ?? live()[key] ?? '';
  sheet(`<h2 class="title">${s.name}</h2><p class="read" style="margin-top:10px">${s.what}</p>
    <div class="steps-list">${s.steps.map((t, i) => `<p><b>${i + 1}</b> ${t}</p>`).join('')}</div>
    <label class="field"><span>${s.field}</span><input type="text" id="st-val" value="${esc(v)}" placeholder="${esc(s.hint)}" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
    <div class="stack" style="margin-top:16px"><button class="btn primary block" id="st-save">Save</button>${v ? '<button class="btn block" id="st-off">Switch this off</button>' : ''}</div>
    <p class="quiet small" style="margin-top:12px">Built and tested with placeholder values. It has not been run with a real account yet, so check the website after you switch it on.</p>`, (body, close) => {
    const save = async (val) => { await saveSettings({ money: { ...mine(), [key]: val } }); close(); toast(val ? 'Saved. Now send it to the engine.' : 'Switched off here. Send the change to the engine.'); };
    $('#st-save', body).onclick = () => { const val = $('#st-val', body).value.trim(); if (!val) return save(''); if (!s.ok(val)) return toast(`That does not look right. Example: ${s.hint}`); save(val); };
    const off = $('#st-off', body); if (off) off.onclick = () => save('');
  });
}

function logSheet() {
  sheet(`<h2 class="title">Money that came in</h2>
    <div class="pair"><label class="field"><span>Amount in dollars</span><input type="number" inputmode="decimal" min="0" step="0.01" id="lg-amount"></label><label class="field"><span>Date</span><input type="date" id="lg-date" value="${ymd()}" max="${ymd()}"></label></div>
    <label class="field"><span>Where from</span><select id="lg-source">${Object.entries(SOURCES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
    <button class="btn primary block" id="lg-save" style="margin-top:16px">Add it</button>`, (body, close) => {
    $('#lg-save', body).onclick = async () => { const amount = Math.round(Number($('#lg-amount', body).value) * 100) / 100; if (!(amount > 0)) return toast('Type the amount'); await saveSettings({ earnings: [...(S.settings.earnings || []), { id: Date.now().toString(36), amount, date: $('#lg-date', body).value || ymd(), source: $('#lg-source', body).value }].sort((a, b) => a.date.localeCompare(b.date)) }); close(); toast('Logged'); };
  });
}

export async function mount(el) {
  root = el; render();
  on(root, 'click', '[data-stream]', (b) => streamSheet(b.dataset.stream));
  on(root, 'click', '#mn-log', logSheet);
  on(root, 'click', '[data-unlog]', (b) => saveSettings({ earnings: (S.settings.earnings || []).filter((e) => e.id !== b.dataset.unlog) }));
  on(root, 'click', '#mn-fol-save', async () => { const n = Math.round(Number($('#mn-fol', root).value)); if (!(n >= 0) || $('#mn-fol', root).value === '') return toast('Type the number'); const day = ymd(); await saveSettings({ followers: [...(S.settings.followers || []).filter((f) => f.date !== day), { date: day, n }].sort((a, b) => a.date.localeCompare(b.date)) }); toast('Saved'); });
  on(root, 'click', '#mn-send', async () => askSheet({ title: 'Send to the engine', href: await ask.config(wanted()), button: 'Send to the engine', lines: ['This tells the engine your account name and money links, so it can put them on the website. Only public links and IDs are sent, never a password or a key.'] }));
}
export function update() { if (root?.isConnected) render(); }
export function destroy() { root = null; }
