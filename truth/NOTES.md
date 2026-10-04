# THE TRUTH — build notes (read this first when resuming work)

Working log of decisions and tested facts, so work can continue after a context reset.
Owner: Ash (non-technical, iPhone, wants short answers). Repo: `swagbb8/Smash-radar`, GitHub Pages from `gh-pages`.

## What Ash asked for (Oct 4 2026)
1. "Remove everything on my news one and just add that" → replace the SMASH NEWS PWA with THE TRUTH (spec: research →
   fact-check → Instagram carousels 1080×1350, dashboard, library, calendar, analytics, theme editor…).
2. "Make me money in any way possible… take as long as you need." Then: "doesn't have to be posting, whatever is the
   best way to make money every day." Asked to choose a path and how much weekly effort → answered "No preference" twice.
   **My call:** content brand + products from the same research, fully hands-off by default (no weekly work required),
   optional accelerators later. I told him plainly: no guaranteed income; accounts that pay him must be created by him.
3. Standing rules: keys only in GitHub secrets (never in chat / committed); never take Instagram passwords; no NFL
   footage; he found the Meta developer setup "too much" (so manual share-sheet posting unless a simple connector exists).
4. `NFL_3D_HIGHLIGHTS/` (3D football) stays in the repo untouched. News app stays live until THE TRUTH is ready, then swap
   (tag the last news commit `smash-news-final`, cancel the running `radar.yml` loop, delete news files + workflow).

## Facts established by probes (do not re-test)
- Repo has NO secrets set (no ANTHROPIC/OPENAI/IG/POSTIZ keys). GitHub Models was retired July 30 2026 (endpoint answers "OK").
- This sandbox can only reach github.com / raw.githubusercontent.com / npm / pypi. All other network testing must run in
  GitHub Actions; pull results back through a branch (`raw.githubusercontent.com/swagbb8/Smash-radar/<branch>/<file>`).
- Free, keyless, reachable from runners: Europe PMC, OpenAlex, Crossref, PubMed, Wikipedia (+pageviews), arXiv, Google
  News RSS, HN Algolia, ScienceDaily RSS, OWID, World Bank, CDC, WHO GHO, DuckDuckGo HTML, Openverse, Wikimedia Commons,
  NASA images. Not usable: Semantic Scholar (429), Reddit (403), GDELT (timeouts), Pexels/Unsplash (keys), Pollinations (flaky).
- Free AI writer = open model on llama.cpp inside the runner (4 vCPU, 16 GB). `engine/llm/serve.sh` installs the newest
  Linux x64 CPU build and downloads the GGUF from Hugging Face. Local calls must **stream** (non-stream requests time out).
- Model bench (1 topic, same 6 sources, all grounded their quotes):
  gemma4-12b (google/gemma-4-12B-it-qat-q4_0-gguf): best voice, no invented numbers, honest about mixed evidence; ~12 min/post.
  granite42-8b thorough but wordy + invents; ministral3-14b / qwen3-14b / qwen35-9b / phi4-14b invent numbers;
  lfm25-8b very fast (18 tok/s) but poor; gptoss-20b needs low reasoning effort + more tokens (untested properly).
  → **Default writer: Gemma 4 12B QAT.** Prompt bug found: example numbers ("23 minutes", "40%") leaked into outputs.

## Architecture
- `truth/engine/` Node ESM, zero deps except `@napi-rs/canvas`:
  `lib/http.mjs` (never throws; record/replay cache), `lib/text.mjs`, `sources/*.mjs` (`search()` → `{ok, items}` with
  `{key,title,authors,year,venue,doi,url,abstract,type,citedBy,retracted}`), `llm/index.mjs` (`chat()` never throws),
  `prompts.mjs` (claims → carousel; schemas), `ground.mjs` (quote/number/causal checks), `images.mjs` (picture desk),
  `render-node.mjs` (PNG slides via the shared renderer), `bench.mjs`.
- `truth/app/render/` shared slide renderer (browser + Node): `theme.js` (presets dossier/signal/noir, single-cut font
  families `TT*`), `typeset.js`, `paint.js` (grain, beam, photo grade, red thread at y=1212, evidence dots), `slides.js`
  (cover, reveal, explain, matters, example, question, sources), `index.js` (`buildDeck`, `renderSlide`).
- Post JSON shape: see `tests/fixtures/sample-post.json` (hooks[], slides{reveal,explain,matters,example,question},
  stat, claims[{id,text,source,quote,level}], sources[], images[]).
- Identity: black / charcoal / paper white / one red; "the red thread" runs through every slide at the same height;
  evidence dots (established / supported / emerging / interpretation / speculation) on every factual slide.

## Workflows
- `truth.yml` THE TRUTH engine: schedule (4×/day) · manual dispatch (`count`, 0 = rebuild only) · issues titled `truth: …` opened by the
  owner (research <topic> | make <n> [subject] | settings + JSON | rewrite <id> <slide> | remove/restore <id>). Steps: restore library from
  branch `truth-data` → `cli.mjs plan` (reads open owner issues) → model (only when writing) → `run` → `build` → commit `truth-data`
  (history kept; refuses to publish if the library shrank) → force-push `gh-pages` → comment + close the issues.
- `truth-probe.yml` (input `models`: `debug` | `hf` | `images` | blank) → branch `truth-probe`.
- `truth-bench.yml` (inputs `only`, `topics`, `pick`) → branches `truth-bench-<name>`.
- News app removed Oct 4 2026 (kept on branch `smash-news-final`; tags cannot be pushed from this sandbox). `highlight.yml` (3D football) untouched.

## Studio (truth/app/studio)
- No build step: ES modules. `js/main.js` router (#/today | files | post/<id>/<tab> | research[/<id>] | plan | money | settings); every view
  mounts into a fresh node (listeners die with it). State: engine data read-only from `../data/*.json`; everything Ash does is in IndexedDB
  (`truth-studio`): per-post `{status, hook, hookText, edits, theme, uploads, caption, hashtags, date, metrics}` + settings.
- `views/post.js` editor (Text follows the visible slide; cover → hook picker + side-by-side covers; Look; Caption; Proof). Live number check
  uses the engine's own `app/shared/ground.js`.
- Local preview: `node engine/dev-store.mjs /tmp/dev-store` → `node engine/cli.mjs build --store /tmp/dev-store --out /tmp/dev-dist` →
  `python3 -m http.server` in the out dir → /studio/. Smoke test with Playwright (Chromium in /opt/pw-browsers).
- Honest-status rule: the Money page hides website streams until `version.json.site` is true (set when `engine/site.mjs` exists).

## Session quirk
Ash sometimes re-sends a message, which rewinds the conversation: earlier tool work stays on disk / in git but
disappears from context. Always `git log --oneline -15` and read this file before writing code.

## Next steps (keep updated)
1. Public website (`engine/site.mjs`): article page per file (deterministic from claims/quotes), index, search, RSS, sitemap, money slots
   (tips, Amazon tag, AdSense, product, newsletter) → then the Money page streams switch on.
2. Renderer: slides 2–5 are top-heavy; bigger body type; picture desk v2 (CC0/PD only). Bump `RENDER_VERSION` when slides change.
3. Monthly collection PDF; short vertical video with voice; trending signals for topic choice; unit tests (`tests/*.test.mjs`).
4. Writer quality: read `truth-bench-gemma4-12b` / `truth-bench-gptoss-20b` (4 topics each) and compare.
