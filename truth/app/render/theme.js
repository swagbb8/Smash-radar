// THE TRUTH — visual identity tokens. One place decides every colour, typeface and measure used on a slide.
// The same file runs in the browser (studio preview / export) and in Node (engine renders the final PNGs).

export const SIZE = { w: 1080, h: 1350, margin: 84 };

/** Font cuts. Each cut is registered under its own family name so weight matching is identical in Safari and Skia. */
export const FONT_FILES = {
  TTSerif400: 'baskervville-latin-400-normal.woff2', TTSerif400i: 'baskervville-latin-400-italic.woff2',
  TTSerif500: 'baskervville-latin-500-normal.woff2', TTSerif500i: 'baskervville-latin-500-italic.woff2',
  TTSerif600: 'baskervville-latin-600-normal.woff2', TTSerif700: 'baskervville-latin-700-normal.woff2',
  TTCaps500: 'baskervville-sc-latin-500-normal.woff2', TTCaps700: 'baskervville-sc-latin-700-normal.woff2',
  TTSans400: 'ibm-plex-sans-condensed-latin-400-normal.woff2', TTSans500: 'ibm-plex-sans-condensed-latin-500-normal.woff2', TTSans600: 'ibm-plex-sans-condensed-latin-600-normal.woff2',
  TTGothic: 'league-gothic-latin-400-normal.woff2',
  TTDidone700: 'bodoni-moda-latin-700-normal.woff2', TTDidone500i: 'bodoni-moda-latin-500-italic.woff2',
};

export const PALETTE = { black: '#000000', charcoal: '#1c1c1c', graphite: '#2e2e2e', smoke: '#5c5c5c', ash: '#8f8f8f', paper: '#f3f1ec', red: '#d4122a' };

/** Presets the theme editor starts from. `display` is the headline voice; everything else stays quiet around it. */
export const PRESETS = {
  dossier: { label: 'Dossier', display: { cover: 'TTSerif600', head: 'TTSerif500', quiet: 'TTSerif400i', caps: false, track: 0, lh: 1.04 }, about: 'Baskerville — the typeface readers are most inclined to believe.' },
  signal: { label: 'Signal', display: { cover: 'TTGothic', head: 'TTGothic', quiet: 'TTSerif400i', caps: true, track: 0.01, lh: 0.94, scale: 1.5 }, about: 'Tall condensed capitals. Loud.' },
  noir: { label: 'Noir', display: { cover: 'TTDidone700', head: 'TTDidone700', quiet: 'TTDidone500i', caps: false, track: -0.005, lh: 1.06, scale: 0.92 }, about: 'High-contrast didone, film-title mood.' },
};

export const DEFAULT_THEME = {
  preset: 'dossier', accent: PALETTE.red, paper: PALETTE.paper, grain: 0.55, light: 0.6, photo: 0.62,   // photo = how dark photographs are graded (0 bright … 1 black)
  brand: 'The Truth', handle: '', site: '', swipeHint: true, evidenceTags: true, thread: true,
};

export function resolveTheme(t = {}) {
  const th = { ...DEFAULT_THEME, ...t }; const p = PRESETS[th.preset] || PRESETS.dossier;
  return { ...th, display: { scale: 1, ...p.display, ...(t.display || {}) }, colors: { ...PALETTE, red: th.accent, paper: th.paper } };
}

export const EVIDENCE = {
  established: { label: 'Established', dots: 3, note: 'meta-analyses, systematic reviews, official statistics' },
  supported: { label: 'Supported', dots: 2, note: 'at least one solid peer-reviewed study' },
  emerging: { label: 'Emerging', dots: 1, note: 'early, small or not yet peer reviewed' },
  interpretation: { label: 'Interpretation', dots: 0, note: 'our reading of the evidence' },
  speculation: { label: 'Speculation', dots: 0, note: 'a possibility, not a finding' },
};
