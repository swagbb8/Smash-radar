"""3D Football Highlight Maker — command line.

    python blender/main.py --play plays/example_touchdown.json                 # build the scene (+ save a .blend)
    python blender/main.py --play plays/example_touchdown.json --preview       # fast 720p preview video
    python blender/main.py --play plays/example_sack.json --render             # final video (STANDARD preset)
    python blender/main.py --text "QB rolls left, throws a 35-yard pass ... and scores" --preview
    python blender/main.py --play plays/x.json --render --preset HIGH --aspect 16:9
    python blender/main.py --play plays/x.json --render --frames 1:120        # one chunk (for splitting across machines)
    python blender/main.py --play plays/x.json --finish                       # graphics + sound + encode from rendered frames

Runs with `pip install bpy` (plain Python) or inside Blender:  blender -b -P blender/main.py -- --play plays/x.json --preview
"""
import argparse, json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser(description='Generate a cinematic 3D football highlight from a play description.')
    ap.add_argument('--play', help='play JSON file'); ap.add_argument('--text', help='plain-English play description (converted to play JSON)')
    ap.add_argument('--preview', action='store_true', help='fast preview render'); ap.add_argument('--render', action='store_true', help='final render')
    ap.add_argument('--finish', action='store_true', help='only draw graphics + encode from frames already rendered')
    ap.add_argument('--preset', choices=['DRAFT', 'PREVIEW', 'STANDARD', 'HIGH', 'CINEMATIC']); ap.add_argument('--aspect', default='9:16', choices=['9:16', '16:9', '1:1'])
    ap.add_argument('--samples', type=int); ap.add_argument('--fps', type=int); ap.add_argument('--frames', help='A:B frame range to render'); ap.add_argument('--every', type=int, default=1)
    ap.add_argument('--still', type=int, nargs='*', help='render these frame numbers as stills with graphics (0 = pick key moments)'); ap.add_argument('--name', help='output name (default: play file name)')
    ap.add_argument('--lighting', choices=['DAY', 'NIGHT', 'PRIMETIME', 'CINEMATIC']); ap.add_argument('--weather', choices=['none', 'rain', 'snow']); ap.add_argument('--camera', choices=['cinematic', 'broadcast', 'behind', 'sideline', 'endzone'])
    ap.add_argument('--no-replay', action='store_true'); ap.add_argument('--no-sound', action='store_true'); ap.add_argument('--save-blend', action='store_true', help='also save renders/<name>/<name>.blend')
    ap.add_argument('--sheet', type=int, help='QA: render N evenly spaced frames with graphics and tile them into renders/<name>/sheet.jpg')
    ap.add_argument('--cam', help='debug: fixed camera "x,y,z,tx,ty,tz" in yards for --still')
    ap.add_argument('--save-json', help='write the play JSON produced from --text to this path'); ap.add_argument('--info', action='store_true', help='print the timeline and exit (no Blender needed)')
    return ap.parse_args(argv)


def main():
    a = parse_args()
    import play_parser
    if a.text: js = play_parser.parse_text(a.text)
    elif a.play:
        with open(a.play) as f: js = json.load(f)
    else: sys.exit('give --play <file.json> or --text "<description>"')
    if a.save_json:
        with open(a.save_json, 'w') as f: json.dump(js, f, indent=2)
    play = play_parser.normalize(js)
    if a.lighting: play['lighting'] = a.lighting
    if a.weather: play['weather'] = a.weather
    if a.camera: play['camera_style'] = a.camera
    if a.no_replay: play['replay'] = False
    name = a.name or (os.path.splitext(os.path.basename(a.play))[0] if a.play else 'custom_play')
    if a.info:
        from simulation import build_play
        sim = build_play(play); sim.seek(sim.duration)
        print(f"{play['label']}: {play['desc']}\n  line of scrimmage: {50 - sim.L:.0f} yards from the end zone, duration {sim.duration:.1f}s, result: {sim.result_text}")
        for e in sim.events: print(f"  {e['t']:5.2f}  {e['type']}" + (f" ({e['move']})" if e.get('move') else ''))
        import camera_system, replay_system
        from scene_builder_presets import RENDER_PRESETS
        fps = a.fps or RENDER_PRESETS[a.preset or 'PREVIEW'][1]; tl, key = replay_system.build_timeline(sim, sim.events, camera_system.direct(sim, sim.events, play.get('camera_style', 'cinematic')), fps, replay=bool(play.get('replay', True)))
        print(f"  shots: {' -> '.join(dict.fromkeys(f['seg'][0] + ':' + f['shot']['type'] for f in tl))}"); print(f'FRAMES={len(tl)} FPS={fps} SECONDS={len(tl) / fps:.1f}')
        return
    import render
    if a.finish and not (a.render or a.preview):
        render.finish(name, sound=not a.no_sound); return
    import scene_builder
    preset = a.preset or ('PREVIEW' if a.preview or not a.render else 'STANDARD')
    ctx = scene_builder.build_scene(play, preset=preset, aspect=a.aspect, samples=a.samples, fps=a.fps)
    render.save_meta(ctx, name)
    if a.save_blend or not (a.render or a.preview or a.still is not None):
        import bpy
        path = os.path.join(render.out_dir(name), f'{name}.blend'); bpy.ops.wm.save_as_mainfile(filepath=path); print('saved', path)
    if a.sheet:
        from PIL import Image
        n = ctx['frames']; picks = sorted({max(1, min(n, int(1 + (n - 1) * k / (a.sheet - 1)))) for k in range(a.sheet)}); ims = [Image.open(render.still(ctx, name, f)) for f in picks]
        w, h = ims[0].size; cols = min(len(ims), 6 if w < h else 4); rows = -(-len(ims) // cols); sheet = Image.new('RGB', (cols * w // 2, rows * h // 2))
        for k, im in enumerate(ims): sheet.paste(im.resize((w // 2, h // 2)), ((k % cols) * w // 2, (k // cols) * h // 2))
        path = os.path.join(render.out_dir(name), 'sheet.jpg'); sheet.save(path, quality=88); print('sheet', path, 'frames', picks, [f"{ctx['timeline'][f - 1]['seg']}:{ctx['timeline'][f - 1]['shot']['type']}@{ctx['timeline'][f - 1]['t']:.1f}" for f in picks]); return
    if a.still is not None:
        frames = a.still or sorted({max(1, int(ctx['frames'] * k)) for k in (0.03, 0.3, 0.45, 0.6, 0.8, 0.97)})
        if a.cam:
            import bpy; from mathutils import Vector
            v = [float(x) * 0.9144 for x in a.cam.split(',')]; cam = ctx['camera']; cam.animation_data_clear(); cam.data.animation_data_clear(); cam.location = v[:3]
            cam.rotation_euler = (Vector(v[3:]) - Vector(v[:3])).to_track_quat('-Z', 'Y').to_euler(); cam.data.dof.use_dof = False; cam.data.lens = 28
        for f in frames: print('still', render.still(ctx, name, min(f, ctx['frames'])))
        return
    if a.render or a.preview:
        first, last = (int(x) if x else None for x in a.frames.split(':')) if a.frames else (None, None)
        render.render_frames(ctx, name, first, last, a.every)
        if not a.frames or a.finish: render.finish(name, sound=not a.no_sound)


if __name__ == '__main__':
    main()
