# MONKEY'S LIFE — build notes (read first when resuming)

Ash's own show: dark sci-fi mystery comedy, adult tone (swearing, dirty jokes). **Seven** = a large lab-grown chimpanzee, scrappy and
ragged, thrown back to ancient jungle Earth with a device fused into his LEFT forearm. He wakes naked in swamp mud with no memory.
Troop later: Grub (huge, loud), Petch (small, anxious), Dolo (calm female). The full bible, Episode 1 script and book chapter are in
Ash's past chats ("Seven the monkey's sci-fi origin story", "Animal battle royale game concept").

Ash asked (Oct 4–5 2026): "can you maybe make my monkey show now?" → "3d monkey show realistic?". Promise made to him: a first look
at Seven before anything is animated, then the opening of ARISE as a real video. THE TRUTH keeps running by itself (paused project).

## The scene being made first: ARISE cold open, in ASH'S OWN WORDS (this is the script; stay faithful to it)
"i slid my eyes open the grass met up to my eye view, i felt cold as the mud covers my body head to toe, quickly then i realized i was
laying on the ground i rose up in a sitting position my eyes started wandering in confusion of why i woke from swamp lands the ground
filled my feet of cold mud up to my knees when i was standing tall the trees were rows and rows leading to darkness of more rows of
trees with vines hanging down connected together to one another. Looking up i saw the sun trying to climb through the leaves of the
trees but just barely brings a dim light down below reflecting off the water of the swamp, there was a branch close enough to me so i
can get out of the swamp I only then jumped up reached out my hands to try to cling on but by the time i did i noticed a device dug
into my arm i froze slipped off the branch falling to the water hitting my back on the ground swimming back up quickly grabbing the
branch again this time i latched on tightly pulling myself up as i feel sharp pain in my back i managed to get on top of the branch
and position myself hanging from the tree i sit down and stare at whatever this thing on my arm is, i was mezmorized the screen was
shattered it fit the size of my palm i never seen anything like it"
Then: smash cut to black, title card MONKEY'S LIFE — Episode 1 — "ARISE". Sound: swamp ambience, one low wrong electronic hum.
Device look: memory says scar line + circuit patterns under the fur that glow when it wakes; glow colour used = cold blue.

## Pipeline (MONKEYS_LIFE/blender, Blender 5.2.2 via `pip install bpy==5.2.2` on Python 3.13; local box = 2 slow cores)
- `basemesh.py` CC0 MakeHuman mesh/targets/rig weights; `noise3`. `ape.py` numpy sculpt → chimp (FACE sliders, `_sculpt_head`,
  `region()` masks from "trans" sliders, `relax()` smoothing, PROP per-bone proportions, coat maps: fur density/length/flow/lift/hang/grey,
  face shapes Blink/JawOpen/BrowUp/BrowDown, eye bones). Teeth pulled inside the mouth.
- `skinpaint.py` paints the head in code on its own cylinder UV ('HeadUV'): height (nostrils as real displacement, folds, wrinkles,
  3D cell grain), colour (hex = sRGB, painted in linear), roughness → `assets/seven/head_*_2048.png` (cached by hash, git-ignored).
- `device.py` the device: layout on the forearm, mesh (frame + glass), painted maps (cracks/display; scar ring + circuit traces).
- `seven.py` builds it all in Blender: body (subsurf 2 + material displacement), real eyes (shell with clear cornea + iris dish;
  `EYE` in ape.py), fur = hair curves following the skin (`fur_strands`, ~405k; `wet=1` = soaked/clumped), `mud_field()` node group
  (MudLevel, MudWet: one field for skin, fur, device; `S.mud(level, wet)`), `device_object`, `device_power(sv, value, wave=cm)`,
  `pose()/aim()` (bones pointed in world directions), `look_at()`, `ground()`, `face()`.
- `poses.py` named poses: knuckle, arm, look, study (crouched, forearm level, staring at the device).
- `studio.py` look-dev stills (`--fur --pose study --cam hero|face|device|three --power 1 --wave 2.5 --mud 0.5 --wet 1 --mood flat|night
  --samples N --furraw 0.7 --bloom 0.5 --crop x0,y0,x1,y1`). `sheet.py` contact sheets (`--views head|body|device --clay`).
- `finish.py` compositor: denoise everything EXCEPT fur (OIDN smears fur into paint; raw fur needs ≥128 samples), bloom.
- `assets.py` + `swamp.py` the ARISE set: mud terrain (`ground_z`), black water (absorbing volume box), 6 instanced buttressed trunks
  in rows, scanned jacaranda crowns/trees (Poly Haven) near the clearing, vines (one NURBS curve object), scanned plants, grass tufts,
  the fallen branch (scan), mist volume, film-style lighting: dim HDRI + area lamps through leaf-cut screens (`_gobo`). Lamps must be
  very strong (16–60 kW) at these distances. Canopy casts no shadows on purpose. `python swamp.py out.png --cam wide --parts ...`.
- Scene assets: branch `monkey-assets` (Poly Haven CC0) → clone into `MONKEYS_LIFE/assets/scene` (locally a symlink to
  /home/claude/monkey-assets). Fetch more with the "Monkey assets" workflow (`ids`, `res`).
- Cloud: workflow `monkey-look.yml` (input `jobs` = JSON list of {name, args, tool: studio|sheet|shot}) renders stills in parallel and
  pushes each to branch `monkey-renders` as it finishes. Start it with the REST API (gh GraphQL is blocked here):
  `gh api -X POST repos/swagbb8/Smash-radar/actions/workflows/monkey-look.yml/dispatches --input -` with {"ref":"main","inputs":{"jobs":"[...]"}}.
  Artifacts cannot be downloaded from this sandbox (blob host blocked): always go through a branch. A runner is ~2x the local box.

## Measured costs (720x900 face close-up with fur): 64 spp ≈ 5 min local / 2.5 min runner. Fixed overhead per render ≈ 12 s.
The swamp with real mist: 800x336 @ 32 spp ≈ 3.4 min local. Far too slow to render whole per frame → PLAN BELOW.

## Plan for the video (decided, not built yet)
1. Plates: every shot has a locked-off camera (moves are done in 2D afterwards; POV look-arounds = one panorama plate re-projected).
   Render the environment once per shot at high quality (with mist) → EXR plate.
2. Per frame render only Seven + a small "zone" of ground/water/grass round him; everything else in the scene is a holdout
   (still shadows and lights him). Composite over the plate inside Blender's compositor (linear), then fur-safe denoise, bloom.
3. `shots.py` (camera, poses over time, device/mud values, 2D move, sound cues), `anim.py` (pose keys, breathing, tremble, blinks, eye
   darts), `render.py` (plate / frames / assemble), a workflow that renders frame chunks on 20 runners and assembles the MP4 with sound
   (synth ambience + hum; Kokoro TTS only if narration is wanted) and the title card. Format 2.39:1 (1280x536 or 1920x804), 24 fps.
4. Shot list (≈60–70 s): POV eyes open through grass → ECU his eyes in the mud → rises to sitting → POV rows of trees/vines/light on
   water → stands knee-deep, looks up (sun through leaves) → sees the branch, jumps, grabs → ECU device in his arm, he freezes → slips,
   falls (splash mostly off-screen) → hand out of the water, climbs → sits on the branch staring at it, finger touches the cracked
   screen, one pulse runs out along the lines → wide: tiny on the branch in the dark wood → smash cut, title.

## Known weak spots / ideas
- Hands and feet are still human-shaped (long fingers, no ape big toe); ears are plain; no eyelashes; lips have no inner colour.
- Hairline now fades in; chin beard is sparse white hairs. Body skin outside the head is procedural (hidden by fur).
- Device display content is abstract on purpose (no invented lore). Ask Ash before adding e.g. "SUBJECT 07".
