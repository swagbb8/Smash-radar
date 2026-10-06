"""Render a shot.

    python render.py plate  <shot> <outdir> [--quality draft|preview|final]              -> <outdir>/<shot>_plate.exr (+ .png to look at)
    python render.py frames <shot> <outdir> [--quality ...] [--range a:b] [--step n]      -> <outdir>/<shot>/f0001.png ...  (needs the plate)
    python render.py still  <shot> <outdir> --at seconds                                  -> one finished frame, plate included
    python render.py sheet  <shot>[,<shot>...] <outdir> [--n 12] [--view x,y,z:x,y,z:lens] -> a contact sheet of the motion, flat light, no fur (fast)
"""
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def arg(name, default=None):
    a = sys.argv; return a[a.index(name) + 1] if name in a and a.index(name) + 1 < len(a) else default


def sheet(names, outdir):
    """Evenly spaced moments of each shot, side by side, to judge staging and motion before anything costly is rendered."""
    import bpy
    import shots
    from PIL import Image, ImageDraw
    n = int(arg('--n', 12)); st = shots.Stage('draft', seven=True, fur=False); sc = st.sc; w, h = (int(v) for v in arg('--size', '480x200').split('x')); sc.render.resolution_x, sc.render.resolution_y = w, h
    for name in names:
        shot = shots.SHOTS[name]; shot.setup(st); st.debug_mode(int(arg('--samples', 6)))
        if arg('--view'):
            a, b, lens = arg('--view').split(':'); st.camera(tuple(float(v) for v in a.split(',')), tuple(float(v) for v in b.split(',')), lens=float(lens))
        cols = int(arg('--cols', 4)); rows = (n + cols - 1) // cols; sh = Image.new('RGB', (cols * w, rows * h)); d = ImageDraw.Draw(sh); t0 = time.time()
        for i in range(n):
            t = shot.dur * i / max(1, n - 1) if arg('--times') is None else float(arg('--times').split(',')[i]); shot.frame(st, t); p = os.path.join(outdir, f'_{name}_{i:02d}.png'); sc.render.filepath = p; bpy.ops.render.render(write_still=True)
            im = Image.open(p).convert('RGB'); sh.paste(im, ((i % cols) * w, (i // cols) * h)); d.text(((i % cols) * w + 6, (i // cols) * h + 4), f'{t:.2f}s', fill=(255, 255, 0)); os.remove(p)
        out = os.path.join(outdir, f'{name}_sheet{arg("--tag", "")}.png'); sh.save(out); print(f'{out} in {time.time() - t0:.0f}s', flush=True)


def witness(name, outdir):
    """Moments of a shot from the shot camera and from witness cameras round him (flat light): is the pose what was meant?
    --real 1 = his real skin and fur instead of clay; --on <point> = what the witness cameras look at (Head, Eyes, LeftPalm ...);
    --dist 0.3 = how far off they stand (1 = about 3 m)."""
    import bpy
    import shots
    from mathutils import Vector
    from PIL import Image, ImageDraw
    real = arg('--real') == '1'; st = shots.Stage('preview' if real else 'draft', seven=True, fur=real); sc = st.sc; w, h = (int(v) for v in arg('--size', '480x320').split('x')); shot = shots.SHOTS[name]; shot.setup(st); st.debug_mode(int(arg('--samples', 24 if real else 6)), clay=not real)
    cam0 = (st.cam.location.copy(), st.cam.rotation_euler.copy(), st.cam.data.lens, st.cam.data.dof.use_dof); times = [float(v) for v in arg('--at', '0').split(',')]; rows = []; k = float(arg('--dist', 1.0)); on = arg('--on', 'Spine1')
    for t in times:
        shot.frame(st, t); bpy.context.view_layer.update(); arm = st.sv['arm']; c = st.actor.point(on); tiles = []
        views = [('shot', None), ('from east', (c + Vector((3.2, -0.6, 0.5)) * k, c, 35)), ('from south', (c + Vector((0.3, -3.4, 0.6)) * k, c, 35)), ('from west', (c + Vector((-3.2, 0.5, 0.5)) * k, c, 35)), ('from north', (c + Vector((-0.3, 3.4, 0.6)) * k, c, 35)), ('from above', (c + Vector((0.02, -0.5, 3.6)) * k, c, 35))]
        for label, v in views:
            if v is None:
                st.cam.location, st.cam.rotation_euler, st.cam.data.lens = cam0[0], cam0[1], cam0[2]; st.cam.data.dof.use_dof = False; sc.render.resolution_x, sc.render.resolution_y = w, int(w / 2.39)
            else: st.camera(tuple(v[0]), tuple(v[1]), lens=v[2]); sc.render.resolution_x, sc.render.resolution_y = w, h
            p = os.path.join(outdir, '_w.png'); sc.render.filepath = p; bpy.ops.render.render(write_still=True); im = Image.open(p).convert('RGB'); canvas = Image.new('RGB', (w, h)); canvas.paste(im, (0, (h - im.size[1]) // 2))
            ImageDraw.Draw(canvas).text((6, 4), f'{label} {t:.2f}s', fill=(255, 255, 0)); tiles.append(canvas)
        rows.append(tiles); P = lambda n: [round(v, 2) for v in st.actor.point(n)]
        print(f't={t}: root {[round(v, 2) for v in arm.location]} head {P("Head")} eyes {P("Eyes")} Lpalm {P("LeftPalm")} Rpalm {P("RightPalm")} Lfoot {P("LeftFoot")} Rfoot {P("RightFoot")} seat {P("Seat")}', flush=True)
    sh = Image.new('RGB', (w * len(rows[0]), h * len(rows)))
    for r, tiles in enumerate(rows):
        for i, im in enumerate(tiles): sh.paste(im, (i * w, r * h))
    out = os.path.join(outdir, f'{name}_witness{arg("--tag", "")}.png'); sh.save(out); print(out, flush=True)


def _save_png(bpy, sc, exr):
    """A plate is kept as linear EXR; this writes a picture of it to look at."""
    img = bpy.data.images.load(exr); fmt = (sc.render.image_settings.file_format, sc.render.image_settings.color_depth); sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_depth = '8'
    img.save_render(exr.replace('.exr', '.png'), scene=sc); sc.render.image_settings.file_format, sc.render.image_settings.color_depth = fmt; bpy.data.images.remove(img)


def plates(shot, name, outdir, quality):
    """The plate(s) of a shot seen through his eyes: one panorama, or one picture per focus distance (--variant i renders just that one)."""
    import bpy
    import shots
    st = shots.Stage(quality, seven=True, fur=False); sc = st.sc; ids = list(range(len(shot.focus))) if shot.kind == 'focus' else [None]
    if arg('--variant') is not None: ids = [int(arg('--variant'))]
    if arg('--samples'): st.q['plate_samples'] = int(arg('--samples'))
    else: st.q['plate_samples'] = max(48, st.q['plate_samples'] // 2)                             # these plates are big and soft (mist, blur): half the samples is plenty
    for i in ids:
        if i is None: shot.setup(st)
        else: shot.setup(st, i)
        st.plate_mode(fog=shot.fog); p = os.path.join(outdir, f'{name}_plate' + ('' if i is None else f'_f{i}') + '.exr'); sc.render.filepath = p; t1 = time.time(); bpy.ops.render.render(write_still=True); _save_png(bpy, sc, p)
        print(f'plate {os.path.basename(p)} {sc.render.resolution_x}x{sc.render.resolution_y} in {time.time() - t1:.0f}s', flush=True)


def eyes_frames(shot, name, outdir, quality):
    """Frames of a shot seen through his eyes: the plate(s) looked at by a camera that turns. Fast; no swamp is loaded."""
    import shots, project
    size = tuple(int(v) for v in arg('--size').split('x')) if arg('--size') else shots.QUALITY[quality]['size']; pj = project.Projector(size, samples=int(arg('--samples', 24)), bloom=shot.bloom)
    if shot.kind == 'pano': pj.pano(os.path.join(outdir, f'{name}_plate.exr'), shot.lon, shot.lat)
    else: pj.focus([os.path.join(outdir, f'{name}_plate_f{i}.exr') for i in range(len(shot.focus))], lens=shot.lens / shot.scale, aspect=1.0 / 1.5 * 2.39 * (size[0] / size[1]) / 2.39)
    a, b = (int(v) for v in arg('--range', f'1:{shot.frames}').split(':')); step = int(arg('--step', 1)); fdir = os.path.join(outdir, name); os.makedirs(fdir, exist_ok=True); t0 = time.time()
    for f in range(a, b + 1, step): t = (f - 1) / shots.FPS; pj.render(os.path.join(fdir, f'f{f:04d}.png'), shot.view(t), shot.view(t + 1.0 / shots.FPS), frame=f)
    print(f'{name}: frames {a}..{b} in {time.time() - t0:.0f}s', flush=True)


def main():
    mode, name, outdir = sys.argv[1], sys.argv[2], os.path.abspath(sys.argv[3]); quality = arg('--quality', 'draft'); os.makedirs(outdir, exist_ok=True)
    if mode == 'sheet': return sheet(name.split(','), outdir)
    if mode == 'witness': return witness(name, outdir)
    import bpy
    import shots
    shot = shots.SHOTS[name]; t0 = time.time()
    if shot.kind in ('pano', 'focus'): return plates(shot, name, outdir, quality) if mode == 'plate' else eyes_frames(shot, name, outdir, quality)
    st = shots.Stage(quality, seven=True); sc = st.sc; shot.setup(st); plate = os.path.join(outdir, f'{shot.plate_name}_plate.exr')
    if arg('--lens'): st.cam.data.lens = float(arg('--lens'))                                  # look-dev overrides: a different lens from the same spot, more samples, a bigger frame
    if arg('--samples'): st.q['samples'] = int(arg('--samples')); st.q['plate_samples'] = int(arg('--samples')) * 2
    if arg('--size'): st.q['size'] = tuple(int(v) for v in arg('--size').split('x')); sc.render.resolution_x, sc.render.resolution_y = st.q['size']
    if arg('--nodof') == '1': st.cam.data.dof.use_dof = False
    if arg('--flat'):                                                                           # a plain lamp at the lens (watts), to see what is really in front of the camera
        from mathutils import Vector
        f = st.cam.matrix_world.to_3x3() @ Vector((0, 0, -1)); st.lamp('Flat', tuple(st.cam.location + Vector((0, 0, 0.15))), tuple(st.cam.location + f * 1.0), float(arg('--flat')), (1, 1, 1), 0.5)
    print(f'stage ready in {time.time() - t0:.0f}s', flush=True)
    if mode in ('plate', 'still') and not (mode == 'still' and os.path.exists(plate)):
        shot.frame(st, 0.0); st.plate_mode(fog=shot.fog); sc.render.filepath = plate; t1 = time.time(); bpy.ops.render.render(write_still=True); _save_png(bpy, sc, plate); print(f'plate in {time.time() - t1:.0f}s', flush=True)
    if mode == 'plate': return
    st.char_mode(plate, shot.center(st), *shot.zone, bloom=shot.bloom)
    if mode == 'still':
        t = float(arg('--at', 0)); shot.frame(st, t); sc.render.filepath = os.path.join(outdir, f'{name}_{t:05.2f}.png'); t1 = time.time(); bpy.ops.render.render(write_still=True); print(f'still in {time.time() - t1:.0f}s', flush=True); return
    a, b = (int(v) for v in arg('--range', f'1:{shot.frames}').split(':')); step = int(arg('--step', 1)); fdir = os.path.join(outdir, name); os.makedirs(fdir, exist_ok=True)
    for f in range(a, b + 1, step):
        t1 = time.time(); shot.frame(st, (f - 1) / shots.FPS); sc.cycles.seed = 0; sc.render.filepath = os.path.join(fdir, f'f{f:04d}.png'); bpy.ops.render.render(write_still=True); print(f'frame {f} in {time.time() - t1:.0f}s', flush=True)


if __name__ == '__main__': main()
