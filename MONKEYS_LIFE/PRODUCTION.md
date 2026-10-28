# Monkey's Life — production report (evidence-based)

Script = STORY.md "Oct 25 outline" + SHOTLIST_v3.md; shot code = blender/ep1_*.py (SCENEx play-order lists).

## Audit, 2026-10-28
| System | Status | Evidence |
|---|---|---|
| Machine | 7.6 GB RAM, RTX 3050 Laptop 6 GB (driver 610.88), ~65 GB free on C: | nvidia-smi, Win32_ComputerSystem |
| Blender 5.2.2 (bpy, Cycles OptiX) | Verified working | 640x360 32-spp GPU test frame in 2.2 s, valid PNG |
| Blender procedural chimp (seven.py/ape.py, fur) | Working with limitations: not photoreal | ep1/stills/lab/B08 f0001.png: the face reads as a rubber mask (flat skin, small dull eyes, etched wrinkles); Ash: "looks terrible" |
| Unreal Engine 5 | Missing, dropped by Ash | Launcher log 2026-10-28 22:08–22:20: UE_5.8 install queued to Downloads\UE_5.8, cancelled, uninstalled. No engine folder and no Unreal Projects folder. 5.8 + templates + source would fill most of the 65 GB, and 7.6 GB RAM is far below what the editor needs. |
| Unreal MCP (127.0.0.1:8000) | Failing, cause known | ECONNREFUSED: nothing to connect to without an engine |
| Modal (paid GPU) | Not usable | needs a card; Ash declined |
| Kaggle 2x T4 (free, ~30 GPU h/week) | Verified working | ai/scene1_v1: 3 keyframes + 3 clips made 2026-10-28 |
| Keyframes: Qwen-Image-Edit + cast refs | Verified working | B01/B02/D01: photoreal chimp, identity held from cast/seven_front.jpg |
| Clips: Wan2.2-TI2V-5B | Working with limitations: motion | B01 smears into blur as Seven moves (frames 0/60/120); B02 nearly frozen |
| Clips: Wan2.2-I2V-A14B (GGUF Q4 + Lightning 4-step) | Present but untested | kaggle_run.py CLIPS14, run on ai/test14 (B01, B02) |
| finish.py (scope crop, grade, grain) | Verified working | scene1_v1/finished, looked at B01: cinematic, no artifacts added |
| qa.py (technical checks + contact sheet) | Verified working | PASS x3 on scene1_v1 (832x480, 24 fps, 121 frames) |

## Pipeline decision
AI footage on free Kaggle GPUs, finished locally. The Blender chimp is the realism ceiling, the AI keyframes are not.
Shot list (blender/ep1_*.py) -> ai_scene.plan -> keyframe (Qwen-Image-Edit, cast refs = identity) -> clip (Wan) ->
qa.py -> look at the sheet -> finish.py -> cut + sound. Blender stays installed for anything the AI cannot hold, such as the device screen.

## Top 3 problems and fixes
1. **Motion** (smear when moving fast, frozen otherwise): Wan 14B test running. Fallback: plan shots around slow, close moves and cut fast action short.
2. **Identity drift** (orange eyes, the device looks like a sticker, wet white specks): eyes are now dark brown in ep.py and scenes_a.py, and the NEG prompt bans specks, glitter and stickers.
3. **Flat video look** (even white light, 480p): low-key film lighting in the FILM prompt, 1280x720 keyframes, finish.py on every clip.

## Approval rule
A clip is approved only after qa.py PASS **and** someone has looked at its contact sheet: right action, Seven recognizable, no smear, no extra limbs.

## Log
- 2026-10-28 17:47 VERIFIED: 1280x720 lab keys done (415–466 s each). B02 and D01 approved after looking at them (moody low-key light).
  B01 FAILED on look: orange eyes, white specks, strapped device. Cause: cast/seven_front.jpg itself has orange eyes and rain
  drops, and the edit model copies its reference. Fix: eyes recolored brown and specks removed (original kept in
  cast/old/seven_front_orange.jpg). B01 re-queued.
- 17:55 Device continuity fixed in ai_scene.DEVICE: palm-sized screen fused into the LEFT forearm; intact in the lab, shattered
  after the rampage (STORY.md). Before this, every shot asked for "a small cracked chip".
- 17:55 Every Kaggle job now writes <out>/<shot>.<kind>.json (prompt, refs, seed, size, model, time).
- Research (web, 2026 comparisons): Wan 2.2 A14B is still the strongest open image-to-video model for realistic motion.
  HunyuanVideo 1.5 and LTX-2.3 are the alternatives, and LTX-2.3 needs a bigger GPU. Wan 3.0 is API-only. The 14B test is the right test.
- OPEN: ai_scene ignores the Blender camera framing (B01 is written "extreme close-up of the eyes" but came out full body).
