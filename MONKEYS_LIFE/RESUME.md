# Monkey's Life — RESUME (read first; no secrets in here)

Last updated: 2026-10-29 12:10 CDT.

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
- Approved clips: B01 (`test14/out6`), B02 v2 (`test14/out7`), D01 (`test14/out5`). Cut: `phone/scene1_cut_v2.mp4`.
- Rejected keyframes (round 1, before the fixes): C01 B03 D03 B04 B05, kept in `scene1/rejected_v1/`. Round 2 running (`ml-keys`).
- One-take test: `B02x` chained from B02's last frame, running (`ml-clips14`), output in `test14/chain1/`.
- Character sheet v1 rejected (device on the shoulder or a tablet, face drifted). Not in the reference library.
- 3D: Blender Seven was rendered for B01 and is far worse than AI (`ai/phone/compare_3d.jpg`). The AI-3D (Hunyuan3D-2) test
  waits for a Kaggle slot (`ml-mesh`), output in `3dtest/ai3d/`.

## Next actions
1. Review the round 2 keyframes against their pass conditions, post them to the status page, animate the ones that pass.
2. Judge B02x: if the chained take works, plan the scene as chained takes (cut only where the story jumps place or time).
3. Judge the Hunyuan3D mesh in Blender honestly. Keep AI-first unless it is clearly better.
4. Continue Scene 1 in batches of 5 shots. Then Scene 2 onward.
