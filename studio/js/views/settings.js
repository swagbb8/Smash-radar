// Settings: the engine's real status, the look every file starts from, tone, an honest list of what is connected,
// and a backup of what lives on this device.
import { $, $$, esc, on, toast, ago, fmtDate, plain, writerName } from '../ui.js';
import { S, saveSettings, exportBackup, importBackup, local } from '../state.js';
import { loadPost, loadVersion, asset } from '../data.js';
import { drawSlide } from '../render.js';
import { PRESETS, DEFAULT_THEME } from '../../../render/index.js';
import { themeOf, download } from '../export.js';
import { ask, actionsUrl, secretsUrl } from '../engine.js';
import { askSheet, minutesPerFile } from './common.js';
import { wanted, unsent } from '../config.js';

let root, sample = null, timer;
const ACCENTS = [['#d4122a', 'Signal red'], ['#a50f22', 'Dried blood'], ['#e8341c', 'Vermilion'], ['#ff2d55', 'Hot red'], ['#f3f1ec', 'No colour']];
const TONE = { 1: ['Calm', 'Measured. Reads like a careful explainer.'], 2: ['Direct', 'Plain and pointed. The default.'], 3: ['Intense', 'Confrontational and unsettling. Facts stay exactly as strict.'] };
const KEYED = { anthropic: ['Claude', 'ANTHROPIC_API_KEY'], gemini: ['Gemini', 'GEMINI_API_KEY'], groq: ['Groq', 'GROQ_API_KEY'], openai: ['OpenAI', 'OPENAI_API_KEY'] };

const look = () => ({ ...DEFAULT_THEME, ...themeOf() });
async function preview() {
  if (!root?.isConnected) return; const id = S.index.posts[0]?.id; if (!id) return;
  sample = sample?.id === id ? sample : await loadPost(id); if (!sample || !root?.isConnected) return;
  const a = $('#set-cv0', root), b = $('#set-cv1', root); if (a) await drawSlide(a, sample, themeOf(), local(id), 0); if (b) await drawSlide(b, sample, themeOf(), local(id), 1);
}
function setLook(change) { saveSettings({ theme: { ...(S.settings.theme || {}), ...change } }); clearTimeout(timer); timer = setTimeout(preview, 90); }

function integrations() {
  const pr = S.engine.providers || {}; const w = S.engine.writer;
  const rows = [
    ['on', 'AI writer', `${writerName(w?.model || 'gemma-4-12b')}, an open model that runs inside the engine. Free, no key.`],
    ['on', 'Research search', 'Europe PMC and OpenAlex, two open indexes of scholarly papers. Free, no key.'],
    ['on', 'Fact checks', 'Quotes are matched against the paper, numbers must appear in the paper, cause-and-effect wording is blocked for studies that only show a link.'],
    ['on', 'Slides, export, share sheet', 'Drawn on this device at 1080 × 1350.'],
    S.version?.site ? ['on', 'Website, articles, feed', 'Published by the engine after every run.'] : ['off', 'Website with articles', 'Not built yet.'],
    ...Object.entries(KEYED).map(([k, [name, secret]]) => [pr[k]?.ready ? 'half' : 'off', `${name} as the writer`, pr[k]?.ready ? `Key found (${secret}). The code path exists but has never been run against the real service.` : `Not connected. Needs a paid key saved as the GitHub secret ${secret}. The code exists and has never been run against the real service.`]),
    ['off', 'Photo search', 'Switched off. Free photo libraries returned pictures that did not fit. Add your own picture to any slide in the Look tab.'],
    ['off', 'AI-generated pictures', 'Not built.'],
    ['off', 'Posting to Instagram for you', 'Not built. It needs a Meta developer app. You post with the Share button.'],
    ['off', 'Reading Instagram Insights', 'Not built. You type the numbers in under “Log results”.'],
  ];
  return `<div class="list">${rows.map(([st, name, text]) => `<div><i class="lamp ${st === 'on' ? 'on' : st === 'half' ? 'half' : ''}"></i><div class="grow"><h3>${esc(name)}</h3><p>${esc(text)}</p></div></div>`).join('')}</div>`;
}

async function render() {
  const t = look(); const run = S.engine.runs?.[0]; const totals = S.engine.totals || {}; const w = wanted(); const v = await loadVersion().catch(() => null); if (!root?.isConnected) return;
  const range = (label, key, val) => `<label class="field"><span>${label}<em>${Math.round(val * 100)}</em></span><input type="range" min="0" max="1" step="0.05" value="${val}" data-look="${key}"></label>`;
  const toggle = (label, key, val) => `<label class="toggle"><input type="checkbox" data-look="${key}" ${val ? 'checked' : ''}><span>${label}</span></label>`;
  root.innerHTML = `<div class="wrap">
    <section class="section"><h1 class="title">The engine</h1>
      <p class="read" style="margin-top:10px">${run ? `Last ran ${esc(ago(run.at))}: ${run.made} file${run.made === 1 ? '' : 's'} made${run.failed ? `, ${run.failed} dropped` : ''}, in ${Math.round(run.seconds / 60)} minutes.` : 'It has not finished a run yet.'} ${S.engine.schedule ? esc(S.engine.schedule) : ''}</p>
      <div class="figures" style="margin-top:14px"><div><b>${totals.made || 0}</b><span>Files made</span></div><div><b>${totals.failed || 0}</b><span>Dropped</span></div><div><b>${S.engine.runway ?? '—'}</b><span>Topics lined up</span></div><div><b>${minutesPerFile()}</b><span>Minutes a file</span></div></div>
      ${(run?.failures || []).length ? `<p class="quiet small" style="margin-top:12px">Dropped last time: ${run.failures.map((f) => `“${esc(f.topic)}”. ${esc(plain(f.reason))}`).join(' ')}</p>` : ''}
      <div class="btn-row" style="margin-top:14px"><a class="btn" id="set-run" target="_blank" rel="noopener">Start a run by hand</a></div>
    </section>

    <section class="section"><span class="label">The look of every file</span>
      <div class="samples"><canvas id="set-cv0" width="1080" height="1350"></canvas><canvas id="set-cv1" width="1080" height="1350"></canvas></div>
      <div class="presets">${Object.entries(PRESETS).map(([k, p]) => `<button data-preset="${k}" aria-pressed="${t.preset === k}"><b class="pv pv-${k}">Aa</b><span>${esc(p.label)}</span></button>`).join('')}</div>
      <div class="swatches">${ACCENTS.map(([c, n]) => `<button data-accent="${c}" aria-pressed="${String(t.accent).toLowerCase() === c}" aria-label="${n}" style="--c:${c}"></button>`).join('')}</div>
      ${range('Film grain', 'grain', t.grain)}${range('Light', 'light', t.light)}${range('Photo darkness', 'photo', t.photo)}
      <div class="toggles">${toggle('Evidence label on fact slides', 'evidenceTags', t.evidenceTags)}${toggle('“Swipe” on the cover', 'swipeHint', t.swipeHint)}${toggle('The red thread', 'thread', t.thread)}</div>
      <button class="btn ghost" id="set-look-reset" style="margin-top:8px">Back to the original look</button>
    </section>

    <section class="section"><span class="label">Tone</span>
      <div class="pick wide tone">${[1, 2, 3].map((n) => `<button data-tone="${n}" aria-pressed="${w.intensity === n}">${TONE[n][0]}</button>`).join('')}</div>
      <p class="quiet small" style="margin-top:10px">${esc(TONE[w.intensity]?.[1] || '')} Applies to files the engine writes from now on.</p>
      <label class="field"><span>New files a day<em>${w.daily}</em></span><input type="range" min="2" max="16" step="2" value="${w.daily}" id="set-daily"></label>
    </section>

    <section class="section"><span class="label">Names</span>
      <label class="field"><span>Instagram account name</span><input type="text" id="set-handle" value="${esc(S.settings.handle || S.config.handle || '')}" placeholder="thetruth.files" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
      <label class="field"><span>Your own web address, if you buy one</span><input type="text" id="set-domain" value="${esc(w.domain)}" placeholder="www.example.com" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
      <p class="quiet small" style="margin-top:8px">The website is at ${esc(S.config.site || asset(''))}. A bought address also needs one record at the seller: point <b>www</b> to <b>${esc((S.config.owner || 'your-name') + '.github.io')}</b>. Not tested with a real address yet.</p>
      ${unsent() ? '<button class="btn primary block" id="set-send" style="margin-top:14px">Send my changes to the engine</button>' : ''}
    </section>

    <section class="section"><span class="label">What is connected</span>${integrations()}<p class="quiet small" style="margin-top:10px">Keys go in GitHub secrets only. Never type one into this app or into a chat.</p><div class="btn-row" style="margin-top:10px"><a class="btn" id="set-secrets" target="_blank" rel="noopener">Open GitHub secrets</a></div></section>

    <section class="section"><span class="label">This device</span>
      <p class="quiet">Your edits, approvals, calendar and logs are stored on this device only. Save a backup before you switch phones.</p>
      <div class="btn-row" style="margin-top:12px"><button class="btn" id="set-export">Save a backup</button><label class="btn">Load a backup<input type="file" accept="application/json,.json" id="set-import" hidden></label></div>
      <div class="btn-row" style="margin-top:10px"><button class="btn" id="set-update">Get the newest version</button></div>
      <p class="quiet small" style="margin-top:12px">${v?.built ? `Built ${esc(fmtDate(v.built, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}. Engine ${esc(v.engine || '')}.` : ''}</p>
    </section></div>`;
  actionsUrl().then((u) => { const a = $('#set-run', root); if (a) a.href = u; }); secretsUrl().then((u) => { const a = $('#set-secrets', root); if (a) a.href = u; });
  preview();
}

export async function mount(el) {
  root = el; await render();
  on(root, 'click', '[data-preset]', (b) => { setLook({ preset: b.dataset.preset }); $$('[data-preset]', root).forEach((x) => x.setAttribute('aria-pressed', x === b)); });
  on(root, 'click', '[data-accent]', (b) => { setLook({ accent: b.dataset.accent }); $$('[data-accent]', root).forEach((x) => x.setAttribute('aria-pressed', x === b)); });
  on(root, 'input', 'input[type="range"][data-look]', (i) => { i.previousElementSibling.querySelector('em').textContent = Math.round(i.value * 100); setLook({ [i.dataset.look]: Number(i.value) }); });
  on(root, 'change', 'input[type="checkbox"][data-look]', (i) => setLook({ [i.dataset.look]: i.checked }));
  on(root, 'click', '#set-look-reset', async () => { await saveSettings({ theme: {} }); await render(); toast('Original look restored'); });
  on(root, 'click', '[data-tone]', async (b) => { await saveSettings({ engine: { ...(S.settings.engine || {}), intensity: Number(b.dataset.tone) } }); render(); });
  on(root, 'input', '#set-daily', (i) => { i.previousElementSibling.querySelector('em').textContent = i.value; });
  on(root, 'change', '#set-daily', async (i) => { await saveSettings({ engine: { ...(S.settings.engine || {}), daily: Number(i.value) } }); render(); });
  on(root, 'change', '#set-handle', async (i) => { const v = i.value.replace(/^@/, '').trim(); if (v && !/^[a-z0-9._]{1,30}$/i.test(v)) return toast('That does not look like an Instagram name'); await saveSettings({ handle: v }); render(); });
  on(root, 'change', '#set-domain', async (i) => { const v = i.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''); if (v && !/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(v)) return toast('Type it like www.example.com'); await saveSettings({ engine: { ...(S.settings.engine || {}), domain: v } }); render(); });
  on(root, 'click', '#set-send', async () => askSheet({ title: 'Send to the engine', href: await ask.config(wanted()), button: 'Send to the engine', lines: ['The engine picks up your names, tone and money links on its next run. Only public values are sent, never a password or a key.'] }));
  on(root, 'click', '#set-export', async () => { download(new Blob([JSON.stringify(await exportBackup())], { type: 'application/json' }), `truth-studio-backup-${new Date().toISOString().slice(0, 10)}.json`); toast('Backup saved'); });
  on(root, 'change', '#set-import', async (i) => { try { await importBackup(JSON.parse(await i.files[0].text())); toast('Backup loaded'); render(); } catch (e) { toast('That file is not a studio backup'); } });
  on(root, 'click', '#set-update', async () => { try { const regs = await navigator.serviceWorker?.getRegistrations?.() || []; await Promise.all(regs.map((r) => r.update().catch(() => {}))); if (window.caches) for (const k of await caches.keys()) await caches.delete(k); } catch (e) { /* offline or unsupported */ } location.reload(); });
}
export function destroy() { clearTimeout(timer); root = null; }
