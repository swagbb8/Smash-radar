# Monkey's Life — RESUME (read first; no secrets in here)

Last updated: 2026-10-29 16:05 CDT.

## Sources of truth
- Story: `STORY.md` ("Oct 25 outline" supersedes everything older). Shots: `blender/ep1_*.py` (class docstring = action,
  `dur`, `lines`; `SCENEx` lists = play order). Shot status: `status/STATUS.md` (from `episode1/status.py`).
- Production log, with every test, failure and cause: `PRODUCTION.md`. Reviewer links: `status/INDEX.md`.
- Outputs (not in git, too big): `~/Videos/MonkeysLife/ai/` — `cast/` (references), `scene1/` (keyframes + `review.json`
  verdicts), `test14/outN/` (Wan 14B clips), `phone/` (Ash's phone page source, artifact 1bnuYg8QK9U7TQdHgmizem).

## The pipeline (verified)
1. `ai_scene.plan()` turns a shot into a keyframe prompt (cast from action + on-screen speakers, prop glossary, framing,
   device state) and a clip prompt (no quoted speech, camera move).
2. `scene_kaggle.py <module> <list> <cast> <out> --only IDS --keys-only` runs keyframes on Kaggle (Qwen-Image-Edit, ~7 min each).
   `keyfix.despeckle` runs after. LOOK at every keyframe and write the verdict in `<out>/review.json`.
3. Clips: `kaggle_run.run('clips14', jobs, out, keys=<folder with approved SHOT.jpg>, wait=False)` then
   `kaggle_run.fetch('ml-clips14', out, poll=True)`. Wan 2.2 I2V A14B Q4 GGUF + Lightning: ~17 min per 5 s, 832x480 at 16 fps.
4. LOOK at frame strips, `qa.py`, and record the clip verdict in `review.json`.
5. `scene_cut.py` joins approved clips: 16->24 fps interpolation, film finish, push-in, edit FX, subtitles, room tone.
6. `status.py`, then commit and push. Update the phone page.

## Limits
Kaggle: 2 GPU sessions at once, ~30 GPU h/week (account ashton2387). Laptop: 7.6 GB RAM, RTX 3050 6 GB, so no local
generation. Ash said: stay free (no paid GPUs or APIs). HF ZeroGPU anonymous quota is used up for the day.

## State
- Approved clips: B01 (`test14/out6`), B02 v2 (`test14/out7`) + B02x one-take (`test14/chain1`), D01 (`test14/out5`, played
  inside B02's take), C01 B03 D03 (`test14/r3a`), B04 B05 (`test14/r3b`). Cut: `phone/scene1_v3.mp4` (39.6 s).
- D03x (D03 chained from B03's last frame, same set) running on `ml-clips14` -> `test14/chain2`. If approved: B03=r3a/B03+chain2/D03x --into D03:B03.
- Parallel Kaggle runs share the `ml-input` dataset: upload ALL their keyframes in one version.
- Clip jobs need scene_kaggle's format: name, secs<=5, 832x480 (not plan()'s raw clip dict).
- 3D route closed (Blender Seven far worse; Hunyuan3D shape statue-like, texture OOM on T4).

## Next actions
1. Judge D03x; re-cut Scene 1; move subtitles off the cards (scene_cut.py sub position).
2. Keyframes for the next 5 of Scene 1: C02 B06 D11 D02 B07. Review, animate, chain within the same set.
3. Continue Scene 1, then Scene 2 onward.
