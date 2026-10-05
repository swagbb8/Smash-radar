"""Render a shot.

    python render.py plate  <shot> <outdir> [--quality draft|preview|final]              -> <outdir>/<shot>_plate.exr (+ .png to look at)
    python render.py frames <shot> <outdir> [--quality ...] [--range a:b] [--step n]      -> <outdir>/<shot>/f0001.png ...  (needs the plate)
    python render.py still  <shot> <outdir> --at seconds                                  -> one finished frame, plate included
"""
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def arg(name, default=None):
    a = sys.argv; return a[a.index(name) + 1] if name in a and a.index(name) + 1 < len(a) else default


def main():
    mode, name, outdir = sys.argv[1], sys.argv[2], os.path.abspath(sys.argv[3]); quality = arg('--quality', 'draft'); os.makedirs(outdir, exist_ok=True)
    import bpy
    import shots
    shot = shots.SHOTS[name]; t0 = time.time(); st = shots.Stage(quality, seven=True); sc = st.sc; shot.setup(st); plate = os.path.join(outdir, f'{name}_plate.exr')
    print(f'stage ready in {time.time() - t0:.0f}s', flush=True)
    if mode in ('plate', 'still') and not (mode == 'still' and os.path.exists(plate)):
        shot.frame(st, 0.0); st.plate_mode(fog=shot.fog); sc.render.filepath = plate; t1 = time.time(); bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(plate); sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_depth = '8'; img.save_render(plate.replace('.exr', '.png'), scene=sc); print(f'plate in {time.time() - t1:.0f}s', flush=True)
    if mode == 'plate': return
    st.char_mode(plate, shot.center(st), *shot.zone, bloom=shot.bloom)
    if mode == 'still':
        t = float(arg('--at', 0)); shot.frame(st, t); sc.render.filepath = os.path.join(outdir, f'{name}_{t:05.2f}.png'); t1 = time.time(); bpy.ops.render.render(write_still=True); print(f'still in {time.time() - t1:.0f}s', flush=True); return
    a, b = (int(v) for v in arg('--range', f'1:{shot.frames}').split(':')); step = int(arg('--step', 1)); fdir = os.path.join(outdir, name); os.makedirs(fdir, exist_ok=True)
    for f in range(a, b + 1, step):
        t1 = time.time(); shot.frame(st, (f - 1) / shots.FPS); sc.cycles.seed = f; sc.render.filepath = os.path.join(fdir, f'f{f:04d}.png'); bpy.ops.render.render(write_still=True); print(f'frame {f} in {time.time() - t1:.0f}s', flush=True)


if __name__ == '__main__': main()
