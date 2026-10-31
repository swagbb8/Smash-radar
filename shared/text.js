// Small text utilities shared by the engine (pure functions, also unit-tested).
export const clean = (s) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
export const norm = (s) => clean(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[‘’‚′`]/g, "'").replace(/[“”„″]/g, '"').replace(/[‐‑‒–—−]/g, '-').replace(/[^a-z0-9%.\-' ]+/g, ' ').replace(/\s+/g, ' ').trim();
export const words = (s) => norm(s).replace(/[.']/g, ' ').split(' ').filter(Boolean);
export const slug = (s, n = 60) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, n).replace(/-+$/, '');
export const truncate = (s, n) => { s = clean(s); if (s.length <= n) return s; const cut = s.slice(0, n); const i = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; ')); return (i > n * 0.6 ? cut.slice(0, i + 1) : cut.slice(0, cut.lastIndexOf(' '))).trim() + (i > n * 0.6 ? '' : '…'); };
export const sentences = (s) => clean(s).match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g)?.map((x) => x.trim()).filter(Boolean) || [];
const STOP = new Set('a an and are as at be been but by can could did do does for from had has have how i if in into is it its may might more most no not of on or our so such than that the their them then there these they this to was we were what when which who why will with would you your about after all also any because before being between both each few he her him his just like many much one only other over own same she should some than too under up very via while'.split(' '));
export const keywords = (s) => words(s).filter((w) => w.length > 2 && !STOP.has(w));
/** Jaccard similarity of keyword sets (0..1) — used for duplicate-topic detection. */
export function similarity(a, b) { const A = new Set(keywords(a)), B = new Set(keywords(b)); if (!A.size || !B.size) return 0; let i = 0; for (const w of A) if (B.has(w)) i++; return i / (A.size + B.size - i); }
export const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
