# MONKEY'S LIFE — build notes (read first when resuming)

Ash's own show: dark sci-fi mystery comedy, adult tone (swearing, dirty jokes). **Seven** = a large lab-grown chimpanzee, scrappy and
ragged, thrown back to ancient jungle Earth with a device fused into his LEFT forearm. He wakes naked in swamp mud with no memory.
Troop later: Grub (huge, loud), Petch (small, anxious), Dolo (calm female). The full bible, Episode 1 script and book chapter are in
Ash's past chats ("Seven the monkey's sci-fi origin story", "Animal battle royale game concept").

Ash asked (Oct 4–5 2026): "can you maybe make my monkey show now?" → "3d monkey show realistic?". He has been sent: a portrait and a
full body of Seven, the device close-up, and one frame of the wake-up (s03). Promise: the opening of ARISE as a real video.
THE TRUTH keeps running by itself (paused project). Ash is non-technical, on a phone: short messages, things delivered not explained.

## The scene: ARISE cold open, in ASH'S OWN WORDS (this is the script; stay faithful to it)
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
Then: smash cut to black, title card MONKEY'S LIFE — Episode 1 — "ARISE".
Not decided by Ash (ask before adding): narration of these words by a voice; any text on the device's screen (kept abstract).

## The film (cut list = EDL in blender/post.py, about 76 s, 2.39:1, 24 fps)
black → s01_wake (through his eyes: grass, focus pull, eyelids) → s02_eyes (his face in the mud, an eye opens) → s03_rise (pushes up,
sits) → s04_look (through his eyes: looking round the wood) → s05_stand (knee-deep, "standing tall", looks up) → s06_up (through his
eyes: sun in the leaves, the branch) → s07_jump (from behind: leap, one hand catches) → s08_arm (close: the other arm stops in front
of his face, the device; he freezes; fingers slip) → s09_fall (drops, splash) → s10_under (drawn in post) → s12_pull (bursts up, two
hands, hauls himself up) → s13_study / s14_device / s13_study (on the branch: stares, touches it, it wakes) → s15_wide → black → title.

## Pipeline (MONKEYS_LIFE/blender, Blender 5.2.2 = `pip install bpy==5.2.2` on Python 3.13; the sandbox has 2 slow cores, no GPU)
Character: `basemesh.py` (CC0 MakeHuman mesh, rig weights), `ape.py` (numpy sculpt → chimp, coat maps, face shapes Blink / JawOpen /
BrowUp / BrowDown), `skinpaint.py` (painted head), `device.py` (the device), `seven.py` (builds him: body, eyes, fur strands that follow
the skin, mud field `S.mud(level, wet)`, mud cake over the device `S.device_cake(v)`, `S.device_power(sv, v, wave=cm)`, posing by
pointing bones: `S.pose / S.aim`), `poses.py` (named poses), `studio.py` / `sheet.py` (look-dev stills).
Set: `assets.py` + `swamp.py` (mud bed he lies on at BANK, pool under the branch, 670 instanced trunks in rows, scanned jacaranda
crowns, vines, plants, grass, the branch, mist; film lighting = dim HDRI + three strong lamps through leaf-cut screens;
`set_zone()` = what the character pass renders live, `set_ripple()` rings on the water). Scene assets = branch `monkey-assets`.
Animation: `anim.py` (Actor: `key()` poses with root / heading / pitch / roll / sink / pin / reach, `Track` blends keys with per-limb
lag, `alive()` breathing + tremble, `gaze`, `pin()` keeps hands or seat on the branch — call it AFTER alive(), `touch()` finger IK,
`device()` where the screen is), `fx.py` (splash drops + rings).
Shots: `shots.py` (Stage = swamp + Seven; one class per shot: `setup` camera / lamps / keys, `frame(t)`; `sightline()` /
`clear_around()` take grass out of the camera's way; `plate_mode` / `char_mode` / `debug_mode`). Shots through his eyes are plates only
(`kind` pano or focus) and their frames come from `project.py` (the plate as the sky of an empty scene, a camera that turns: ~1 s/frame).
`render.py`: `plate`, `frames`, `still`, `sheet` (fast clay contact sheet), `witness` (shot camera + 5 cameras round him; `--real 1`
real fur, `--on Eyes --dist 0.3` close). `finish.py` compositor (plate under, fur kept un-denoised, bloom).
Finishing: `post.py` (EDL, 2D camera moves and shake, grade, vignette, grain, eyelids for s01, the under-water seconds, title card in
Bebas Neue (OFL, assets/fonts), `film` → mp4, `unpack` chunk videos → frames), `sound.py` (whole soundtrack synthesized from sines and
noise, cues taken from the EDL; nobody has listened to it: the sandbox cannot play audio).

## Cloud (GitHub Actions; gh GraphQL is blocked here → start runs with scratch `dispatch.py`, i.e. REST workflow_dispatch)
- `monkey-look.yml`: stills. input `matrix` = {"include":[{name, args, tool, os}]}, tool = studio | sheet | swamp | shot | witness |
  motion | plate; `assets: yes` when the swamp is needed. Results (png + a .txt timing line) land on branch `monkey-renders`.
- `monkey-shots.yml`: the film. `mode: plates` matrix [{shot, variant?}] → branch `mp/<quality>/<shot>[_f<i>]` (EXR + png);
  `mode: frames` matrix [{shot, range "a:b"}] + `step` → branch `mf/<quality>/<shot>_<a>-<b>_<step>` holding one nearly lossless mkv.
  Then locally: fetch the mf branches, `post.py unpack`, `sound.py`, `post.py film`.
- Artifacts and logs cannot be downloaded from the sandbox: everything comes back through branches; errors through check-run
  annotations (`gh api repos/.../check-runs/<job id>/annotations`). Spread jobs over ubuntu-24.04 / ubuntu-22.04 / ubuntu-latest.
  Apple runners: Blender installs but Metal never finishes; slower than Linux on CPU. Not worth it.

## Measured (4-core Linux runner)
Fur close-up 480x600 @48 spp: 44 s. Preview still of a shot (768x322, plate 96 spp + frame 40 spp): 4.5–7.5 min in all.
Plate through his eyes at preview (1075x675 @96 spp, f/1.6): 16 min. Clay witness frame: ~6 s. Local box ≈ half a runner.

## Look decisions
Swamp light: ambient 0.015, gap 16 kW, sun 70 kW, far 10 kW, mist 0.0045. Wet mud must stay dull (glossy reads as rubber); fur glints
are clamped (sample_clamp_direct 8) or they sparkle. The device is caked in mud until he falls in the water. Constant render seed so
still things do not boil; grain is added in post.

## Known weak spots / ideas
- Hands and feet are still human-shaped; ears are plain; no eyelashes. Only four face shapes.
- No fog in the character pass (haze in front of Seven is missing; not noticeable so far).
- The splash is drops + rings, not a simulation; the under-water piece is drawn in 2D.
