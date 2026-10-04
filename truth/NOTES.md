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
- `truth-probe.yml` (input `models`: `debug` | `hf` | `images` | blank) → branch `truth-probe`.
- `truth-bench.yml` (inputs `only`, `topics`) → branches `truth-bench-<name>`.
- News loop `radar.yml` is still running and force-pushes `gh-pages` every 10 min: cancel it BEFORE deploying THE TRUTH.

## Session quirk
Ash sometimes re-sends a message, which rewinds the conversation: earlier tool work stays on disk / in git but
disappears from context. Always `git log --oneline -15` and read this file before writing code.

## Next steps (keep updated)
1. Prompts: remove example numbers, strip `[F1]` tags from bodies, ask for an "honest angle" when evidence is mixed. Re-bench gemma4 + gpt-oss.
2. Pipeline CLI: discover → research → claims → ground → write → lint/repair → images → render → publish data to gh-pages.
3. Renderer: more impact on cover / stat, photo slides, fill the sources slide; compare presets.
4. Studio PWA (dashboard, discover, research, studio, library, calendar, analytics, money, settings, theme editor).
5. Public site (articles, SEO, RSS), money page + config, products (ebook PDF, posters), short video.
6. Swap out the news app; verify live.
