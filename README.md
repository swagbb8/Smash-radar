# THE TRUTH

An AI research and publishing system. It finds a question, reads the published studies, keeps only what it can prove
with a word-for-word quote, writes an Instagram carousel (1080 × 1350) and files it in a studio where every slide,
caption and source can be inspected, edited, approved, scheduled and exported.

- **Studio (the app):** https://swagbb8.github.io/Smash-radar/studio/
- **Engine:** `truth/engine/` — runs in GitHub Actions four times a day with a free open-source model. No keys.
- **Slides:** `truth/app/render/` — one renderer shared by the studio (browser) and the engine (Node).
- **Library of record:** the `truth-data` branch. The website branch (`gh-pages`) is rebuilt from it on every run.

How a file is made: question → search (Europe PMC, OpenAlex) → claims with exact quotes → quote, number and
cause-and-effect checks in code → carousel → lint → one corrective rewrite → cuts → a file that carries its own proof.
Topics that cannot be proven are dropped and listed with the reason.

Requests from the studio arrive as issues titled `truth: …`; only issues opened by the repository owner are obeyed.
Keys, if any are ever added, live in GitHub secrets only.

Build notes for whoever continues the work: `truth/NOTES.md`.

`NFL_3D_HIGHLIGHTS/` is a separate, paused project (3D football highlight recreation in Blender).
The news app that used to live here is preserved on the branch `smash-news-final`.
