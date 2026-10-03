// UI wiring for the 3D Play Maker: describe -> generate -> add to reel -> export a real video file.
import { parsePlay, describePlay, PLAY_TYPES } from './parser.js';
import { CAMERA_STYLES } from './cameras.js';
import { createEngine, makeClip } from './engine.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const EXAMPLES = ['40-yard touchdown pass', 'Interception returned 60 yards for a touchdown', 'QB escapes a sack and throws a 30-yard touchdown', 'Breakaway 70-yard touchdown run, he jukes two defenders',
  'One-handed catch for 25 yards', 'Strip sack, defense scoops it for a touchdown', '52-yard field goal is good', 'Kickoff returned 100 yards for a touchdown', 'Hail Mary, 48-yard touchdown', 'Screen pass goes for 25 yards',
  'Toe-tap sideline catch for 17 yards', 'Running back stuffed for a loss of 3', 'Jump ball in the end zone, 20-yard touchdown', 'Punt return 70 yards for a touchdown', 'Two-point conversion is good'];
const reel = []; let engine = null, current = null, busy = false;

$('#chips').innerHTML = EXAMPLES.map((e) => `<button class="chip" data-ex="${esc(e)}">${esc(e)}</button>`).join('');
$('#type').innerHTML = '<option value="">Auto (from the description)</option>' + Object.entries(PLAY_TYPES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
$('#camera').innerHTML = Object.entries(CAMERA_STYLES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');

const team = (n) => ({ name: $(`#t${n}name`).value.trim() || `Team ${n}`, abbr: ($(`#t${n}abbr`).value.trim() || `T${n}`).toUpperCase().slice(0, 4), color: $(`#t${n}c`).value, alt: $(`#t${n}a`).value });
function config(desc = $('#desc').value) {
  return { desc: desc.trim(), hint: { type: $('#type').value || undefined, number: $('#num').value.trim() }, teams: [team(1), team(2)],
    style: { anim: $('#anim').value, camera: $('#camera').value, music: $('#music').checked, sfx: $('#sfx').checked }, duration: +$('#dur').value || null,
    score: [+$('#s1').value || 0, +$('#s2').value || 0], quarter: $('#q').value, clock: $('#clock').value.trim() };
}
function showParsed() { try { const p = parsePlay($('#desc').value, { type: $('#type').value || undefined, number: $('#num').value.trim() }); $('#parsed').textContent = describePlay(p).map(([k, v]) => `${k} = ${v}`).join('\n'); } catch (e) { $('#parsed').textContent = String(e.message); } }
function msg(t) { const m = $('#msg'); m.textContent = t || ''; m.style.display = t ? 'flex' : 'none'; }
function setBusy(b) { busy = b; for (const id of ['#gen', '#add', '#one', '#export']) $(id).disabled = b; }
function applyAspect() { const a = $('#aspect').value; $('#screen').className = 'screen' + (a === '16:9' ? ' wide' : a === '1:1' ? ' sq' : ''); engine?.setSize(a); }
function renderReel() {
  $('#list').innerHTML = reel.map((c, i) => `<div class="item"><b>${i + 1}</b><span><small>${esc(c.label)} · ${c.wall.toFixed(0)}s</small>${esc(c.cfg.desc)}</span><button data-play="${i}" aria-label="Play">▶</button><button data-del="${i}" aria-label="Remove">✕</button></div>`).join('');
  $('#empty').style.display = reel.length ? 'none' : ''; $('#count').textContent = reel.length ? `· ${reel.length} play${reel.length > 1 ? 's' : ''} · ${reel.reduce((a, c) => a + c.wall + 2.2, 0).toFixed(0)}s` : '';
  $('#export').textContent = reel.length ? `🎬 EXPORT HIGHLIGHT (${reel.length})` : '🎬 EXPORT HIGHLIGHT';
}
async function generate(cfg = config()) {
  if (!engine || busy) return null; if (!cfg.desc) { msg('Type what happens in the play first.'); return null; }
  applyAspect(); msg(''); current = makeClip(cfg); setBusy(true);
  try { await engine.play([current]); } finally { setBusy(false); }
  return current;
}
function showVideo(blob, type, name) {
  const url = URL.createObjectURL(blob), ext = type.includes('mp4') ? 'mp4' : 'webm', file = `${name}.${ext}`;
  $('#outbox').innerHTML = `<video src="${url}" controls playsinline></video><div class="btns"><button class="b go" id="save">⬇ SAVE VIDEO (${(blob.size / 1e6).toFixed(1)} MB)</button></div>`;
  $('#save').onclick = async () => {
    const f = new File([blob], file, { type });
    if (navigator.canShare?.({ files: [f] })) { try { await navigator.share({ files: [f] }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    const a = document.createElement('a'); a.href = url; a.download = file; document.body.appendChild(a); a.click(); a.remove();
  };
  $('#outbox').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
async function exportClips(clips, opts, name) {
  if (!engine || busy || !clips.length) return; applyAspect(); setBusy(true); msg('');
  try { const { blob, type } = await engine.record(clips, opts); showVideo(blob, type, name); }
  catch (e) { msg(`Could not record: ${e.message}`); } finally { setBusy(false); }
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-ex],[data-del],[data-play]'); if (!t) return;
  if (t.dataset.ex) { $('#desc').value = t.dataset.ex; showParsed(); generate(); }
  else if (t.dataset.del) { reel.splice(+t.dataset.del, 1); renderReel(); }
  else if (t.dataset.play && !busy) { current = reel[+t.dataset.play]; setBusy(true); engine.play([current]).finally(() => setBusy(false)); window.scrollTo({ top: 0, behavior: 'smooth' }); }
});
$('#gen').onclick = () => generate();
$('#add').onclick = () => { const c = current && current.cfg.desc === $('#desc').value.trim() ? current : makeClip(config()); current = c; reel.push(makeClip(c.cfg)); renderReel(); };
$('#one').onclick = () => exportClips([makeClip(config())], { titles: true }, 'smash-3d-play');
$('#export').onclick = () => { if (!reel.length) { msg('Add at least one play to the reel first.'); return; } exportClips(reel.map((c) => makeClip(c.cfg)), { finalCard: true, reelTitle: reel[0].cfg.reelTitle }, 'smash-3d-highlights'); };
$('#clear').onclick = () => { reel.length = 0; renderReel(); };
$('#desc').addEventListener('input', showParsed); $('#type').addEventListener('change', showParsed); $('#num').addEventListener('input', showParsed);
$('#aspect').addEventListener('change', applyAspect);

// ---- real games: scoring plays from the app's own recap data (ESPN play-by-play), recreated in 3D
const QN = ['', 'Q1', 'Q2', 'Q3', 'Q4', 'OT', 'OT'];
async function loadGames() {
  try {
    const get = async (u) => { try { return await (await fetch(u, { cache: 'no-store' })).json(); } catch { return {}; } };
    const [nfl, rec] = await Promise.all([get('../api/nfl.json'), get('../api/recaps.json')]); const seen = new Set(), games = [];
    for (const g of [...(nfl.games || []).filter((x) => x.state === 'post'), ...(rec.recaps || [])]) {          // this week's finals first, then older recaps
      if (!Array.isArray(g.plays) || !g.plays.length || seen.has(String(g.id))) continue; seen.add(String(g.id));
      games.push({ ...g, plays: g.plays.map((p, k, arr) => ({ ...p, prevAway: p.prevAway ?? (k ? arr[k - 1].away : 0), prevHome: p.prevHome ?? (k ? arr[k - 1].home : 0) })) });
    }
    $('#game').innerHTML = '<option value="">Choose a game…</option>' + games.map((r, i) => `<option value="${i}">${esc(r.away.abbr)} ${esc(r.away.score)} @ ${esc(r.home.abbr)} ${esc(r.home.score)}${r.week ? ` · Week ${r.week}` : ''}</option>`).join('');
    $('#game').onchange = () => {
      const r = games[+$('#game').value]; if (!r) return; reel.length = 0;
      const T = (t) => ({ name: t.name || t.abbr, abbr: t.abbr, color: t.color || '#333333', alt: t.alt || '#ffffff' });
      for (const p of r.plays) {
        const isHome = p.team === r.home.abbr, hero = T(isHome ? r.home : r.away), opp = T(isHome ? r.away : r.home), play = parsePlay(p.text);
        const prev = isHome ? [p.prevHome ?? 0, p.prevAway ?? 0] : [p.prevAway ?? 0, p.prevHome ?? 0], after = isHome ? [p.home, p.away] : [p.away, p.home];
        const desc = p.text.replace(/\s*\((?:[^()]|\([^()]*\))*\)\s*$/, '').replace(/ Yd /, '-yard ').replace(/ pass from /, ' TD catch from ').replace(/ Rush$| Run$/, ' TD run');
        reel.push(makeClip({ desc, play: { ...play, desc }, teams: [hero, opp], style: config().style, score: prev, scoreAfter: after, swap: isHome, realGame: true, quarter: QN[p.period] || 'Q1', clock: p.clock || '', reelTitle: `${r.away.abbr} @ ${r.home.abbr}` }));
      }
      renderReel(); if (reel[0]) { current = reel[0]; setBusy(true); engine.play([current]).finally(() => setBusy(false)); }
    };
    const want = new URLSearchParams(location.search).get('game'), gi = games.findIndex((g) => String(g.id) === want);
    if (gi >= 0) { $('#game').value = String(gi); $('#real').open = true; $('#game').onchange(); }
  } catch { $('#game').innerHTML = '<option value="">No games available right now</option>'; }
}

(async () => {
  try { await document.fonts.load('40px Anton'); await document.fonts.load('600 20px Oswald'); } catch {}
  try {
    engine = await createEngine($('#out'), { onState: (s) => { $('#bar').style.width = `${Math.round((s.progress || 0) * 100)}%`; } });
    window.play3d = { engine, makeClip, reel, config };            // for tests / debugging
    applyAspect(); showParsed(); renderReel(); loadGames();
    current = makeClip(config()); engine.still(current, 0.5); msg('Tap GENERATE PLAY'); $('#msg').onclick = () => generate();
  } catch (e) { msg(`3D could not start on this device: ${e.message}`); console.error(e); }
})();
