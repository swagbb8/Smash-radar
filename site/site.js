// Public site behaviour: library search, and the slide strip on a file page (drawn with the same code as the posts).
const q = document.querySelector('#q');
if (q) {
  const cards = [...document.querySelectorAll('#lib .card')]; const none = document.querySelector('#none');
  const run = () => { const words = q.value.toLowerCase().split(/\s+/).filter(Boolean); let shown = 0; for (const c of cards) { const hit = words.every((w) => c.dataset.text.includes(w)); c.hidden = !hit; if (hit) shown++; } none.hidden = shown > 0; };
  q.addEventListener('input', run); const start = new URLSearchParams(location.search).get('q'); if (start) { q.value = start; run(); }
}

const deck = document.querySelector('.deck[data-post]');
if (deck) (async () => {
  const root = new URL(deck.dataset.root, location.href);
  const [R, post, cfg] = await Promise.all([import(new URL('render/index.js', root).href), fetch(new URL(`data/posts/${encodeURIComponent(deck.dataset.post)}.json`, root)).then((r) => r.json()), fetch(new URL('data/config.json', root)).then((r) => (r.ok ? r.json() : {})).catch(() => ({}))]);
  await Promise.all(Object.entries(R.FONT_FILES).map(async ([family, file]) => { const f = new FontFace(family, `url(${new URL('fonts/' + file, root).href})`); await f.load(); document.fonts.add(f); }));
  const env = { createCanvas: (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h }), images: {} };
  const d = R.buildDeck(post, { handle: cfg.handle || '', site: cfg.site || '' }); const canvases = d.slides.map((s, i) => { const c = env.createCanvas(R.SIZE.w, R.SIZE.h); c.setAttribute('role', 'img'); c.setAttribute('aria-label', `Slide ${i + 1} of ${d.slides.length}`); return c; });
  R.renderSlide(canvases[0].getContext('2d'), env, d, 0); deck.replaceChildren(...canvases);
  let i = 1; const next = () => { if (i >= canvases.length) return; R.renderSlide(canvases[i].getContext('2d'), env, d, i); i++; setTimeout(next, 0); }; setTimeout(next, 0);
})().catch((e) => console.warn('slides', e));
