// Public API of the slide renderer.
//   buildDeck(post, theme, edits)  → the ordered slides for a post (with the reader-facing evidence labels)
//   renderSlide(ctx, env, deck, i) → paints slide i on a 1080×1350 canvas context
// env = { createCanvas(w,h), images: { [key]: Image } } — supplied by the browser or by the engine.
import { resolveTheme, SIZE } from './theme.js';
import { LAYOUTS } from './slides.js';
export { SIZE, PRESETS, DEFAULT_THEME, FONT_FILES, EVIDENCE, PALETTE, resolveTheme } from './theme.js';
/** Bump when slides look different, so the engine redraws the library covers. */
export const RENDER_VERSION = '3';

const SERIES = { uncomfortable: 'The uncomfortable truth', hijacked: 'Your brain is being hijacked', unseen: 'The world you don’t see', darkside: 'The dark side of modern life', reality: 'Reality check', future: 'The future is closer than you think', think: 'Think about this' };
const KIND = { 'meta-analysis': 'meta-analysis', 'systematic-review': 'systematic review', rct: 'randomized trial', trial: 'clinical trial', experiment: 'experiment', review: 'review', observational: 'observational study', preprint: 'preprint', study: 'study', data: 'official data', report: 'report', news: 'news report', encyclopedia: 'background' };
const ORDER = { established: 3, supported: 2, emerging: 1 };

export function citeOf(src) { if (!src) return ''; const a = src.cite || src.authors || src.venue || ''; return `${a}${src.year ? (a ? ', ' : '') + src.year : ''}`; }

/** The evidence label for a slide = its weakest referenced claim (never overstate), cited to that claim's source. */
function evidenceFor(post, ids, fallback) {
  const claims = (ids || []).map((id) => post.claims?.find((c) => c.id === id)).filter(Boolean);
  if (!claims.length) return fallback ? { level: fallback, cite: '' } : null;
  const weakest = claims.reduce((a, b) => ((ORDER[b.level] || 2) < (ORDER[a.level] || 2) ? b : a)); const src = post.sources?.find((s) => s.id === weakest.source);
  const srcs = new Set(claims.map((c) => c.source));
  return { level: weakest.level || 'supported', cite: srcs.size > 1 ? `${srcs.size} sources` : [KIND[src?.type] || '', citeOf(src)].filter(Boolean).join(', ') };
}

export function buildDeck(post, themeIn = {}, edits = {}) {
  const theme = resolveTheme(themeIn); const S = { ...post.slides, ...(edits.slides || {}) }; const hookIdx = edits.hook ?? post.hook ?? 0;
  const hook = edits.hookText || post.hooks?.[hookIdx]?.text || post.title; const img = (k) => edits.images?.[k] ?? post.layout?.images?.[k] ?? null;
  const stat = edits.stat === null ? null : edits.stat || post.stat;
  const slides = [
    { role: 'cover', hook, image: img('cover') ?? 0 },
    { role: 'reveal', ...S.reveal, stat: stat?.value ? stat : null, evidence: evidenceFor(post, [...(S.reveal?.facts || []), ...(stat?.fact ? [stat.fact] : [])]) },
    { role: 'explain', ...S.explain, evidence: evidenceFor(post, S.explain?.facts) },
    { role: 'matters', ...S.matters, image: img('matters') ?? 1, evidence: evidenceFor(post, S.matters?.facts, 'interpretation') },
    { role: 'example', ...S.example, image: img('example') ?? 2 },
    { role: 'question', ...S.question },
    { role: 'sources', items: (post.sources || []).filter((s) => (post.claims || []).some((c) => c.source === s.id)).map((s) => ({ cite: citeOf(s), kind: KIND[s.type] || '', title: s.title, venue: s.venue })),
      credits: (post.images || []).filter((i) => i && i.credit).map((i) => i.credit).filter((v, i, a) => a.indexOf(v) === i).join('; ') },
  ].filter((s) => s.role === 'cover' || s.role === 'sources' || s.headline).map((s, index) => ({ ...s, index }));
  return { id: post.id, fileNo: String(post.n ?? 0).padStart(4, '0'), series: SERIES[post.style] || post.styleName || SERIES.uncomfortable, theme, slides };
}

export function renderSlide(ctx, env, deck, i) {
  const s = deck.slides[i]; if (!s) return false;
  ctx.save(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.clearRect(0, 0, SIZE.w, SIZE.h);   // the caller's transform is kept, so a scaled context gives a scaled slide
  LAYOUTS[s.role](ctx, env, deck.theme, s, deck); ctx.restore(); return true;
}
