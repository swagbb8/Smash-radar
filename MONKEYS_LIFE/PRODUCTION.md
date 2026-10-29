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
- 18:05 FIXED: ai_scene.framing() reads each Blender setup() (frame_on size, close/medium, or lens) and puts the shot size first in the prompt (B01 = extreme close-up of eyes and face).
- 2026-10-28 22:10 Wan 14B run 1 was stopped by deleting the kernel after 4.5 h, with no log. A 3 s probe with logging
  showed the cause: Lightning LoRA failed to load because Kaggle ships torchao 0.10 and peft rejects LoRA when an old
  torchao is present. That forced 20 plain steps at about 150 s each, 54 min for 3 s. The job now uninstalls torchao first.
- 2026-10-29 09:28 VERIFIED, Wan 14B with Lightning: about 17 min per 5 s clip (4 steps of about 200 s, 13 GB per T4). Looked at B01 and D01:
  no smearing, identity holds, D01's copied head-scratch action works. Defects: B01 mouth moves as if talking and eyes
  turn orange late; D01 shows fake subtitle text. Cfg 1 ignores the negative prompt, so the clip prompt was reworded (no
  'vocalize' or 'dialogue', eyes stated, "nothing written on it"). 14B is now the clip model.
- 2026-10-29 12:05 Character sheet v1 (cast_sheet.py, 4 views from seven_front.jpg) REJECTED after looking at all four next to
  the original. 3/4 and profile: device on the shoulder as a tablet, and the face smoother and younger than the original (scars and
  deep wrinkles lost). Stool: device rendered as a strapped cuff. Body: best build, but a square tablet device. None entered
  the reference library. Next: body views with bare arms (no device), so they carry only build.
- 12:05 Round 2 of C01/B03/D03/B04/B05 keyframes pushed with the prop glossary, cast fix and arm-device wording (face reference only).
- 12:00 Ash: the cut "feels like a comic book flipping pages". Fixed in the cut: 16->24 fps interpolation, slow push-in, white-out
  dissolve. Then "it switches scene to scene instead of flowing like one shot": testing chained clips (the next clip starts
  on the previous clip's last frame), B02 -> B02x.
- 2026-10-29 12:20 3D re-test (Ash asked to reconsider 3D). Rendered the same shot, B01, with the rigged Blender Seven at 'laptop'
  quality: 19 s a frame on the RTX 3050 (5 s of footage is about 40 min). Looked at frames 61 and 91 next to the approved AI B01
  (ai/phone/compare_3d.jpg). 3D: grey fluffy fur, bead eyes, plastic nose, no set. Far behind the AI frame. Free asset sites
  (CGTrader, Open3DModel) block downloads without an account. The only groomed and rigged chimp found costs money
  (TurboSquid, about $359). Verdict: 3D is not substantially better; it is much worse. Stay AI-first.
