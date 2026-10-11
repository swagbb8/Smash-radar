// Getting finished slides out of the studio: PNG files, one ZIP, or the phone's share sheet.
import { deckOf, imagesFor, slideBlob } from './render.js';
import { S, local } from './state.js';

/** The look every file starts from on this device: Ash's theme + the account names for the last slide. */
export const themeOf = () => ({ ...(S.settings.theme || {}), handle: S.settings.handle || S.config.handle || '', site: S.settings.site || S.config.site || '' });
export const lookKey = () => JSON.stringify(S.settings.theme || {});
const pad = (n, w = 2) => String(n).padStart(w, '0');
export const baseName = (post) => `truth-${pad(post.n ?? 0, 4)}`;

/** Every slide of a post as PNG files, rendered at full size with this device's edits. */
export async function slideFiles(post, onProgress) {
  const loc = local(post.id); const deck = deckOf(post, themeOf(), loc); const images = await imagesFor(post, loc); const files = [];
  for (let i = 0; i < deck.slides.length; i++) {
    const blob = await slideBlob(deck, i, images, 'image/png'); files.push(new File([blob], `${baseName(post)}-${pad(i + 1)}.png`, { type: 'image/png' }));
    onProgress?.(i + 1, deck.slides.length); await new Promise((r) => setTimeout(r, 0));
  }
  return files;
}

export function captionText(post, loc = local(post.id)) {
  const caption = loc.caption ?? post.caption ?? ''; const tags = loc.hashtags ?? post.hashtags ?? [];
  return [caption.trim(), tags.map((t) => '#' + String(t).replace(/^#/, '')).join(' ')].filter(Boolean).join('\n\n');
}

export function download(blob, name) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
}
export const canShareFiles = (files) => { try { return !!navigator.canShare && navigator.canShare({ files }); } catch { return false; } };
/** Must be called directly from a tap. */
export async function shareFiles(files, text = '') { try { await navigator.share(text ? { files, text } : { files }); return true; } catch (e) { if (e?.name === 'AbortError') return false; throw e; } }
export async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { const t = document.createElement('textarea'); t.value = text; t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select(); let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; } t.remove(); return ok; }
}

// ---------------------------------------------------------------------------------------------- zip (store only; PNGs are already compressed)
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
/** entries: [{ name, data: Blob | Uint8Array | string }] → Blob (application/zip) */
export async function zip(entries) {
  const enc = new TextEncoder(); const parts = []; const central = []; let offset = 0; const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1), date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const e of entries) {
    const data = typeof e.data === 'string' ? enc.encode(e.data) : e.data instanceof Uint8Array ? e.data : new Uint8Array(await e.data.arrayBuffer());
    const name = enc.encode(e.name); const crc = crc32(data);
    const head = new DataView(new ArrayBuffer(30)); head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true); head.setUint16(8, 0, true); head.setUint16(10, time, true); head.setUint16(12, date, true);
    head.setUint32(14, crc, true); head.setUint32(18, data.length, true); head.setUint32(22, data.length, true); head.setUint16(26, name.length, true); head.setUint16(28, 0, true);
    parts.push(head.buffer, name, data);
    const cen = new DataView(new ArrayBuffer(46)); cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true); cen.setUint16(10, 0, true); cen.setUint16(12, time, true); cen.setUint16(14, date, true);
    cen.setUint32(16, crc, true); cen.setUint32(20, data.length, true); cen.setUint32(24, data.length, true); cen.setUint16(28, name.length, true); cen.setUint32(42, offset, true);
    central.push(cen.buffer, name); offset += 30 + name.length + data.length;
  }
  const size = central.reduce((n, p) => n + (p.byteLength ?? p.length), 0);
  const end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true); end.setUint32(12, size, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}

/** One post as a ZIP: slides, caption and the list of sources. */
export async function postZip(post, files) {
  const src = (post.sources || []).map((s) => `${s.cite || s.authors || ''}${s.year ? ' (' + s.year + ')' : ''}. ${s.title}. ${s.venue || ''}\n${s.url || ''}`).join('\n\n');
  return zip([...files.map((f) => ({ name: f.name, data: f })), { name: 'caption.txt', data: captionText(post) }, { name: 'sources.txt', data: src }]);
}
