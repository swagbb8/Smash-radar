# MONKEY'S LIFE — build notes (read first when resuming)

Ash's own show: dark sci-fi mystery comedy, adult tone (swearing, dirty jokes). Seven = a large lab-grown chimpanzee, scrappy and
ragged, thrown back to ancient jungle Earth with a device fused under the skin of his LEFT forearm (scar line, circuit traces,
glows blue when it wakes; it is cracked). He wakes naked in swamp mud with no memory. Troop later: Grub (huge, loud), Petch (small,
anxious), Dolo (calm female). Narrator lines exist ("This is the world before words. Before fire. Before any of it.").
Ash asked (Oct 4 2026): "can you maybe make my monkey show now?" → "3d monkey show realistic?". I told him: real 3D with fur and
mood like a good game cutscene, not film-studio realism; first a picture of Seven for approval, then the opening of ARISE
(wakes face-down in mud → finds the device). THE TRUTH keeps running by itself; that project is paused, not abandoned.

## Pipeline (all in MONKEYS_LIFE/, Blender 5.0 via `pip install bpy`, runs locally in this sandbox: 2 cores, ~1–3 min per still)
- `assets/human/` CC0 MakeHuman base mesh + targets + Mixamo-compatible rig weights (copied from NFL_3D_HIGHLIGHTS; that folder stays untouched).
- `blender/basemesh.py` loader, targets, T-pose. `blender/ape.py` numpy sculpt: FACE targets → `_sculpt_head` (skull, brow, muzzle,
  nostrils, ears) → `_reproportion` (PROP per bone) → masks (bare, fur, length, device, muzzle, nostril, iris) + hair flow + eye bones.
- `blender/seven.py` Blender build: skinned mesh, armature made from joints (no third-party rig), materials (skin with device plate /
  `DevicePower` value node, eyes, fur = Principled Hair), fur = real hair curves (`fur_strands`, ~190k) that follow the skin through a
  "Deform Curves on Surface" node; `aim()`/`pose()` point bones in world directions; `look_at()`; `ground()`; `device_power()`.
- `blender/poses.py` named poses (knuckle, look = checking the device). `blender/studio.py` look-dev renders
  (`python studio.py out.png --fur --pose look --cam hero --power 1 --size 720x900 --samples 56`).
- Shader gotchas in 5.0: Mix node colour sockets are inputs 0/6/7 and output 2; textures use the `rest_position` attribute so they
  do not swim; Blender "watts" are bright — a 200 W key at 3 m is plenty for black fur.
- `tools/fetch_polyhaven.py` + workflow `monkey-assets.yml` → branch `monkey-assets` (CC0 Poly Haven plants, rocks, ground, HDRI).
  The sandbox cannot reach polyhaven; runners can. `git clone -b monkey-assets` to use them locally.

## Next
1. Send Ash the look (hero with device, full body, face) and adjust to his notes.
2. Blink / brow shape keys; mud on fur and skin (per-strand `mud` attribute); beetle.
3. Jungle swamp set (ground + puddles, trunks, ferns, mist via the Mist pass, rainforest HDRI).
4. ARISE opening ≈ 40 s: aerial jungle → face-down in mud, beetle → eyes open, pushes up → finds the device, it pulses. Narration
   (Kokoro TTS on a runner), synthesized ambience, title card. Render in Actions in parallel chunks (see NFL `ci.py` for the pattern).
