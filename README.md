# SMASH NEWS
**Everything New. Every Day.**

Personal live radar: DuPage County incidents, brand launches, deals, recalls, store openings, and breaking US/world news, pulled from real sources on a schedule. It's an installable dark iPhone PWA.

No npm install is needed to run it. It's plain Node 20+ with zero runtime dependencies.

```bash
cp .env.example .env      # optional
npm start                 # → http://localhost:8787
npm test                  # 31 tests: parsers, DuPage verifier, lifecycle, full end-to-end API
npm run refresh -- --force   # one-shot sweep from the command line
```

The first sweep starts about 2 seconds after boot and takes 20–60 seconds. After that, sweeps run automatically.


## What's in the app (latest)
- **Smash Live** — Smash the lion reads a fresh news episode every ~10 minutes with a neural AI voice (Microsoft Edge neural TTS generated in GitHub Actions; falls back to the phone's voice). Funny on fun stories, serious on emergencies, always clean.
- **NFL** — live + final scores, quarter-by-quarter, game leaders (player stats), official highlight videos, NFL news (ESPN public API + NFL YouTube).
- **Roads & Safety** — crashes, closures, construction, traffic, police, fire for DuPage, Cook, Kane, Will, Lake, McHenry, Kendall, DeKalb (every item tied to a real county/town).
- **Local & States** — Chicagoland county news + all 50 states.
- **US-only** filter, 240+ sources, Post Studio (Instagram posts, daily/weekly carousels).

## How it stays updated (free)
`.github/workflows/radar.yml` runs `scripts/loop.sh`: one job updates every 10 minutes for ~5.5 hours, then dispatches the next run. An hourly schedule restarts it if it ever stops. The radar's memory lives on the `radar-data` branch; the site is published to `gh-pages`.

## How it gets current information
| Layer | Sources |
|---|---|
| Official | Apple Newsroom, NVIDIA, Google, Microsoft, PlayStation Blog, Xbox Wire, CPSC recalls, FDA recalls, USDA FSIS recalls, National Weather Service alerts for DuPage (zones ILC043/ILZ013) |
| Local | Patch feeds for Naperville, Wheaton, Glen Ellyn, Downers Grove, Lombard, Elmhurst, Hinsdale, Darien, Woodridge, Lisle, Westmont, Bolingbrook |
| Publishers | NPR, BBC, The Verge, Engadget, 9to5Mac, Electrek, Motor1, IGN, Chew Boom, BevNET, Hypebeast, Slickdeals |
| Discovery | 29 topic searches, each run on **both** Bing News and Google News: DuPage towns, I-88/I-355/I-290/IL-390/IL-38/IL-53/IL-59, Metra, outages and flooding, plus every category and brand group |

All sources are in `src/config.js`. You can also add feeds from the in-app **Sources** screen. Each source records its last check, last success, last error, latency, and item counts. A failing source backs off automatically (up to 4× its interval).

### Schedule
- **Fast tier** (DuPage, NWS, breaking): every 5 minutes
- **Normal tier**: every 20 minutes
- **Slow tier**: every 60 minutes
- **Forced full sweep**: daily at 5:15 AM Central
- **Refresh Now** in the app forces every source. Progress streams live over Server-Sent Events.

## Story pipeline
1. **Parse** RSS, Atom, Bing, Google News, and NWS GeoJSON. Bing click-through links are unwrapped to the publisher URL. Google News links are decoded when possible.
2. **DuPage verifier** (`src/dupage.js`). A story gets onto the DuPage radar only with location evidence: an explicit "DuPage County", a DuPage municipality (with an Illinois-context check for names like Wheaton, Elmhurst, and Darien that exist in other states), a DuPage landmark, a Patch article filed under a DuPage town, or an NWS DuPage alert. **A highway name alone is rejected.** Towns that are mostly outside the county (Aurora, Bolingbrook, Bartlett…) are labeled *nearby* and hidden unless you toggle them on. The DuPage screen lists everything the verifier rejected, with the reason.
3. **Classify**: category, brands (with context rules, so "30 degrees Celsius" isn't the drink and "Harrison Ford" isn't the car), flags (LAUNCH, DEAL, RECALL, OPENING/CLOSING, BREAKING), incident type, and why it matters.
4. **De-duplicate**. Same canonical URL means the same story. A near-identical headline from another outlet within 72 hours is merged into "Also reported by".
5. **Lifecycle**:
   - **BREAKING**: fresh and urgent
   - **NEW**: first seen today
   - **ONGOING**: existed before and nothing changed
   - **UPDATED**: headline or details changed. The **What changed?** section shows before → after.
   - **EARLIER**: older and not seen recently
6. **Enrich**: fetches the article page for a real `og:image` and a fuller summary. If a story has no image, it gets category art, never a fake photo.
7. **Optional AI polish**: set `ANTHROPIC_API_KEY` and Claude rewrites the summary and why-it-matters using only the source's text. It's off by default. Without a key, a rule engine writes them.

Every story has an ID, headline, image (when available), category, brands/location, published and discovered times, summary, why it matters, source, original link, and status.

## App
Home · Breaking · Today · This Week · DuPage · Products · Deals · Recalls · Openings · For You · My Brands · Favorites · Search (including **live web search**) · Sources & Health.

Favorite brands and saved stories stay on your device (localStorage).

## Put it on your iPhone (free: GitHub Pages)
1. Push this folder to a **public** GitHub repo (free unlimited Actions minutes).
2. Repo **Settings → Pages → Source: GitHub Actions**.
3. **Actions** tab → "SMASH NEWS sweep" → **Run workflow** (after that it runs by itself about every 10 minutes).
4. Open `https://<you>.github.io/<repo>/` in Safari → Share → **Add to Home Screen**.

In this mode GitHub's servers do the sweeping and publish a JSON snapshot, and the app filters it on your phone. The radar's memory (NEW/ONGOING/UPDATED history, source health) is carried between runs in the Actions cache. Refresh Now loads the newest sweep. To add feeds, edit `src/config.js`. Optional: add an `ANTHROPIC_API_KEY` repo secret for AI summaries.

Other hosts: Netlify (`netlify.toml` + Functions + Blobs), or any always-on Node box / the `Dockerfile` (full live mode with instant Refresh Now and live web search).

## Layout
```
server.js            Node server: static PWA, JSON API, SSE live events, scheduler
src/config.js        sources, brands, categories, DuPage geography
src/feeds.js         RSS/Atom/Bing/Google/NWS parsers + article metadata
src/dupage.js        DuPage verification + incident typing
src/classify.js      brands, flags, "why it matters"
src/engine.js        ingest, de-dupe, change tracking, status, ranking, queries
src/collector.js     fetch scheduling, source health, enrichment, live search
src/api.js           API routes (shared by Node + Netlify)
src/store.js         atomic JSON database
public/              PWA: index.html, app.js, styles.css, sw.js, manifest, icons
netlify/             Netlify Functions adapter (Blobs + scheduled sweeps)
tests/               unit + end-to-end tests (fixtures are test-only)
```

API: `GET /api/stories?view=&category=&brands=&q=&place=&incident=&nearby=1`, `GET /api/stories/:id`, `GET /api/meta`, `GET /api/dupage`, `GET /api/brands`, `GET|POST|PATCH|DELETE /api/sources`, `POST /api/refresh`, `POST /api/search/live`, `GET /api/events` (SSE), `GET /api/health`.
