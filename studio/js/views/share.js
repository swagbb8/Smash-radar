// The share sheet: slides are rendered first, so the tap that shares them is instant (phones only allow sharing
// straight from a tap).
import { $, esc, sheet, toast, ymd } from '../ui.js';
import { patch, statusOf } from '../state.js';
import { slideFiles, captionText, canShareFiles, shareFiles, download, copy, postZip, baseName } from '../export.js';

export function openShare(post, { onDone } = {}) {
  const caption = captionText(post); let files = null;
  const close = sheet(`<h2 class="title">Share this file</h2>
    <p class="quiet" id="sh-status" style="margin-top:8px">Drawing the slides…</p>
    <div class="progress"><i id="sh-bar"></i></div>
    <div class="stack" style="margin-top:18px">
      <button class="btn primary block" id="sh-share" disabled>Share to Instagram</button>
      <button class="btn block" id="sh-zip" disabled>Download all slides</button>
      <button class="btn block" id="sh-copy">Copy the caption</button>
    </div>
    <p class="quiet small" style="margin-top:14px" id="sh-help"></p>
    <button class="btn ghost block" id="sh-posted" style="margin-top:6px">${statusOf(post.id) === 'posted' ? 'Marked as posted' : 'I posted it — mark as posted'}</button>`, async (body) => {
    const status = $('#sh-status', body), bar = $('#sh-bar', body), share = $('#sh-share', body), zipBtn = $('#sh-zip', body);
    $('#sh-copy', body).onclick = async () => toast((await copy(caption)) ? 'Caption copied' : 'Could not copy — select the text in the Caption tab');
    $('#sh-posted', body).onclick = async () => { await patch(post.id, { status: 'posted', postedAt: new Date().toISOString(), date: ymd() }); toast('Marked as posted'); close(); onDone?.('posted'); };
    try { files = await slideFiles(post, (i, n) => { bar.style.width = `${(i / n) * 100}%`; status.textContent = `Drawing slide ${i} of ${n}…`; }); }
    catch (e) { status.textContent = 'The slides could not be drawn: ' + (e.message || e); return; }
    if (!body.isConnected) return;
    status.textContent = `${files.length} slides ready, 1080 × 1350.`; zipBtn.disabled = false;
    zipBtn.onclick = async () => { zipBtn.disabled = true; download(await postZip(post, files), `${baseName(post)}.zip`); zipBtn.disabled = false; toast('Saved as one ZIP file'); };
    if (canShareFiles(files)) {
      share.disabled = false; $('#sh-help', body).textContent = 'The caption is copied when you tap Share. Pick Instagram, or “Save Images” and add them in Instagram, then paste the caption.';
      share.onclick = async () => { copy(caption); try { if (await shareFiles(files)) { toast('Shared. Paste the caption in Instagram.'); } } catch (e) { toast('Sharing failed here — use Download instead'); } };
    } else { share.hidden = true; $('#sh-help', body).textContent = 'This browser cannot hand pictures to other apps. Download the slides, then upload them to Instagram.'; }
  });
  return close;
}
