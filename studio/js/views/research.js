// Research: what the engine is looking into, what it found, and what it threw out. Nothing here is decoration —
// every line comes from the engine's own records.
import { $, esc, on, toast, SUBJECTS, LEVELS, dots, fmtDate, plain } from '../ui.js';
import { S, summary } from '../state.js';
import { loadTopics, loadTrace, loadPost } from '../data.js';
import { ask } from '../engine.js';
import { askSheet, fileNo, seriesOf, minutesPerFile } from './common.js';

let root;
const KIND = { 'meta-analysis': 'Meta-analysis', 'systematic-review': 'Systematic review', rct: 'Randomized trial', trial: 'Clinical trial', experiment: 'Experiment', review: 'Review', observational: 'Observational study', preprint: 'Preprint', study: 'Study', data: 'Official data', encyclopedia: 'Background' };
const WHY = { 'quote not found in the source': 'The quote it gave is not in the paper.', duplicate: 'Said the same thing as another claim.', 'too short': 'Too thin to be a claim.', 'source not in the retrieved set': 'It cited a paper that was never retrieved.' };
const SUPPORTS = { yes: 'The evidence backs the idea.', partly: 'The evidence is mixed, and the file says so.', no: 'The evidence goes against the popular idea, so the file was written as a reality check.' };

async function desk() {
  const topics = await loadTopics(); if (!root?.isConnected) return;
  const cov = Object.fromEntries(Object.keys(SUBJECTS).map((k) => [k, 0])); for (const p of S.index.posts) if (p.subject in cov) cov[p.subject]++;
  const max = Math.max(1, ...Object.values(cov)); const queue = S.engine.queue || []; const waiting = (topics.requests || []).filter((r) => r.status === 'waiting');
  const dropped = Object.entries(topics.used || {}).filter(([, v]) => v.status === 'failed').sort((a, b) => (b[1].at || '').localeCompare(a[1].at || '')).slice(0, 12);
  const signals = S.engine.signals?.items || [];
  root.innerHTML = `<div class="wrap">
    <section class="section"><h1 class="title">Ask the engine</h1>
      <label class="field"><span>A question or a claim you want checked</span><textarea id="rq-topic" rows="2" placeholder="Does background music help you study?"></textarea></label>
      <div class="pair"><label class="field"><span>Subject</span><select id="rq-subject">${Object.entries(SUBJECTS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></label><div class="field"><span>&nbsp;</span><button class="btn primary block" id="rq-send">Send it</button></div></div>
      ${waiting.length ? `<p class="quiet small" style="margin-top:12px">Waiting for the next run: ${waiting.map((r) => `“${esc(r.topic)}”`).join(', ')}</p>` : ''}
    </section>
    <section class="section"><span class="label">Up next</span>
      ${queue.length ? `<div class="list">${queue.slice(0, 8).map((t) => `<div><div class="grow"><h3>${esc(t.topic)}</h3><p>${esc(SUBJECTS[t.subject] || t.subject)}${t.origin === 'request' ? ', you asked for this' : t.origin === 'idea' ? ', proposed by the engine' : ''}${t.interest ? `, ${Number(t.interest).toLocaleString()} people looked this up last month` : ''}</p></div></div>`).join('')}</div>
      <p class="quiet small">${S.engine.runway ?? queue.length} topics are lined up. When the list runs low the engine proposes new ones itself.</p>` : '<p class="quiet">The list appears after the engine’s first run.</p>'}
    </section>
    ${signals.length ? `<section class="section"><span class="label">What people are looking up</span><div class="chips wrapc">${signals.slice(0, 14).map((s) => `<span class="chip">${esc(s.title)}</span>`).join('')}</div><p class="quiet small" style="margin-top:10px">Most-read Wikipedia articles and science headlines from ${esc(S.engine.signals.day || 'this week')}. The engine uses them to pick which questions to research first.</p></section>` : ''}
    <section class="section"><span class="label">What the library covers</span>
      <div class="bars">${Object.entries(cov).map(([k, n]) => `<div class="b"><span>${esc(SUBJECTS[k])}</span><i style="width:${(n / max) * 100}%"></i><span>${n}</span></div>`).join('')}</div>
      <p class="quiet small" style="margin-top:10px">The engine always picks from the thinnest subject first, so the feed never turns into one note.</p>
    </section>
    <section class="section"><span class="label">Research trails</span>
      ${S.index.posts.length ? `<div class="list">${S.index.posts.slice(0, 12).map((p) => { const lv = LEVELS[p.best] || LEVELS.supported; return `<a href="#/research/${encodeURIComponent(p.id)}"><div class="grow"><h3>${esc(p.title || p.hook)}</h3><p>${dots(lv.dots)} ${esc(lv.label)}, ${p.claims} checked claim${p.claims === 1 ? '' : 's'} from ${p.sources} source${p.sources === 1 ? '' : 's'}</p></div><span class="num small-num">${p.cred ?? ''}</span></a>`; }).join('')}</div>` : '<p class="quiet">No files yet.</p>'}
    </section>
    <section class="section"><span class="label">Dropped for lack of proof</span>
      ${dropped.length ? `<div class="list">${dropped.map(([, v]) => `<${v.trace ? `a href="#/research/${encodeURIComponent(v.trace)}"` : 'div'}><div class="grow"><h3>${esc(v.topic)}</h3><p>${esc(plain(v.reason))}</p></div></${v.trace ? 'a' : 'div'}>`).join('')}</div>` : '<p class="quiet">Nothing has been dropped yet. When the engine cannot find solid studies for a topic, or cannot prove what it wrote, the topic lands here instead of in your library.</p>'}
    </section></div>`;
}

async function trail(id) {
  const [t, post] = await Promise.all([loadTrace(id), loadPost(id)]); if (!root?.isConnected) return;
  if (!t) { root.innerHTML = `<div class="wrap"><div class="empty"><h2 class="title">No research trail was kept for this one</h2><p style="margin-top:14px"><a class="btn" href="#/research">Back</a></p></div></div>`; return; }
  const R = t.research || {}; const W = t.write || {}; const src = Object.fromEntries((R.sources || []).map((s) => [s.id, s])); const used = new Set((R.facts || []).map((f) => f.source)); const sm = summary(id);
  root.innerHTML = `<div class="wrap trail">
    <div class="file-head flat"><a class="back" href="#/research">Research</a>${sm ? `<span class="no">No. ${fileNo(sm)}</span>` : '<span class="stamp new">Dropped</span>'}<span class="grow"></span>${post ? `<a class="btn ghost small-btn" href="#/post/${encodeURIComponent(id)}">Open file</a>` : ''}</div>
    <h1 class="title" style="margin-top:8px">${esc(t.topic)}</h1>
    ${!t.ok ? `<div class="note" style="margin-top:14px">Not published. ${esc(plain(t.reason))}</div>` : ''}
    <ol class="thread-list">
      <li><h3>Searched</h3><p>${R.search ? `${Number(R.search.found || 0).toLocaleString()} papers came back from Europe PMC and OpenAlex. ${R.search.relevant ?? (R.sources || []).length} were on the question.` : 'Search details were not recorded.'}${(R.search?.errors || []).length ? ` ${R.search.errors.length} search request(s) failed.` : ''}</p></li>
      <li><h3>Read ${(R.sources || []).length} paper${(R.sources || []).length === 1 ? '' : 's'}</h3>
        ${(R.sources || []).map((s) => { const lv = LEVELS[s.level] || LEVELS.supported; return `<p class="paper">${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>` : esc(s.title)}<br><span class="quiet">${dots(lv.dots)} ${esc(KIND[s.type] || 'Study')}${s.year ? ', ' + s.year : ''}${s.citedBy ? `, cited ${Number(s.citedBy).toLocaleString()} times` : ''}${used.has(s.id) ? '' : ', not quoted'}</span></p>`; }).join('')}</li>
      <li><h3>Kept ${(R.facts || []).length} claim${(R.facts || []).length === 1 ? '' : 's'}</h3><p class="quiet">Each one has a word-for-word quote that the engine found in the paper, and every number in it appears in the paper.</p>
        ${(R.facts || []).map((f) => `<div class="claim"><p>${esc(f.claim)}</p><blockquote>“${esc(f.quote)}”</blockquote><span class="src">${esc(src[f.source]?.title || f.source)}${f.causalWarning ? '<br>Shows a link, not a cause.' : ''}</span></div>`).join('')}</li>
      <li><h3>Threw out ${(R.rejected || []).length}</h3>
        ${(R.rejected || []).length ? R.rejected.map((f) => `<div class="claim out"><p>${esc(f.claim)}</p><span class="src">${esc(WHY[f.reason] || f.reason || 'Failed the check.')}</span></div>`).join('') : '<p class="quiet">Every claim the writer proposed passed the checks.</p>'}</li>
      ${R.verdict || R.supports ? `<li><h3>Verdict</h3><p>${esc(SUPPORTS[R.supports] || '')}</p>${R.verdict ? `<p class="read" style="margin-top:8px">${esc(R.verdict)}</p>` : ''}${R.caveat ? `<p class="quiet" style="margin-top:8px">${esc(R.caveat)}</p>` : ''}</li>` : ''}
      ${t.write ? `<li><h3>Written in ${W.drafts || 1} draft${(W.drafts || 1) === 1 ? '' : 's'}</h3>${(W.fixes || []).length ? `<p>Corrected automatically: ${esc(W.fixes.join('; ').replace(/\(s\)/g, ''))}.</p>` : '<p class="quiet">Nothing had to be cut.</p>'}
        ${(W.issues || []).filter((i) => i.severity !== 'high').length ? `<p class="quiet">Small notes left for you: ${esc((W.issues || []).filter((i) => i.severity !== 'high').map((i) => `${i.where.replace('.', ' ')} (${i.detail})`).join('; '))}.</p>` : ''}${!W.ok && W.reason ? `<p>${esc(W.reason)}</p>` : ''}</li>` : ''}
    </ol>
    <p class="quiet small" style="margin:22px 0">${t.at ? `Researched ${fmtDate(t.at, { month: 'long', day: 'numeric', year: 'numeric' })}.` : ''}</p></div>`;
}

export async function mount(el, [id]) {
  root = el;
  on(root, 'click', '#rq-send', async () => {
    const topic = $('#rq-topic', root).value.replace(/\s+/g, ' ').trim(); if (topic.length < 12) return toast('Write the question out in a few more words');
    askSheet({ title: 'Send it to the engine', href: await ask.research(topic, $('#rq-subject', root).value), button: 'Send to the engine', lines: [`“${esc(topic)}”`, `If solid studies exist, a finished file lands in your library, usually within the hour (the work itself takes about ${minutesPerFile()} minutes). If they do not, it shows up under “Dropped for lack of proof”.`] });
  });
  await (id ? trail(id) : desk());
}
export function navigate([id]) { if (!root?.isConnected) return false; window.scrollTo(0, 0); (id ? trail(id) : desk()); return true; }
export function update() { if (root?.isConnected && !location.hash.split('/')[2]) desk(); }
export function destroy() { root = null; }
