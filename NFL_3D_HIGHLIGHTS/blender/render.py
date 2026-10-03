"""Rendering + finishing: Cycles frames -> broadcast graphics -> sound -> MP4.

render_frames()  renders a frame range to PNG (resumable: frames already on disk are skipped, so a job can be
                 split across machines with --frames A:B).
finish()         draws the HUD on every frame, builds the audio track and encodes the video with FFmpeg.
"""
import json, os, shutil, subprocess, time
try: import bpy
except ImportError: bpy = None           # finish() only needs Pillow, numpy and FFmpeg
import hud, audio
from utils import RENDERS, log


def out_dir(name):
    d = os.path.join(RENDERS, name); os.makedirs(os.path.join(d, 'frames'), exist_ok=True); return d


def render_frames(ctx, name, first=None, last=None, every=1):
    sc = ctx['scene']; d = out_dir(name); first = first or 1; last = min(last or ctx['frames'], ctx['frames']); t0 = time.time(); done = 0
    for f in range(first, last + 1, every):
        path = os.path.join(d, 'frames', f'{f:05d}.png')
        if os.path.exists(path) and os.path.getsize(path) > 1000: continue
        sc.frame_set(f); sc.render.filepath = path; bpy.ops.render.render(write_still=True); done += 1
        el = time.time() - t0; left = (last - f) / every
        log(f'rendered frame {f}/{last} ({el / done:.1f}s per frame, about {el / done * left / 60:.0f} min left)')
    return d


def still(ctx, name, frame, path=None):
    sc = ctx['scene']; d = out_dir(name); raw = os.path.join(d, f'still_{frame:05d}_raw.png'); sc.frame_set(frame); sc.render.filepath = raw; bpy.ops.render.render(write_still=True)
    path = path or os.path.join(d, f'still_{frame:05d}.jpg'); hud.compose(raw, path, ctx['graphics'][frame - 1]); os.remove(raw); return path


def save_meta(ctx, name):
    """Everything finish() needs, so graphics + encoding can run later / elsewhere without rebuilding the scene."""
    d = out_dir(name); meta = dict(frames=ctx['frames'], fps=ctx['fps'], size=ctx['size'], total=ctx['total'], graphics=ctx['graphics'], cues=ctx['cues'], label=ctx['play']['label'], desc=ctx['play']['desc'])
    with open(os.path.join(d, 'meta.json'), 'w') as f: json.dump(meta, f)
    return meta


def finish(name, meta=None, out=None, keep_frames=False, sound=True):
    d = out_dir(name)
    if meta is None:
        with open(os.path.join(d, 'meta.json')) as f: meta = json.load(f)
    comp = os.path.join(d, 'composited'); os.makedirs(comp, exist_ok=True); n = meta['frames']; missing = []; last_ok = None
    for i in range(1, n + 1):
        src = os.path.join(d, 'frames', f'{i:05d}.png')
        if not os.path.exists(src):
            missing.append(i)
            if last_ok is None: continue
            src = last_ok                                         # hold the previous frame rather than fail the whole video
        else: last_ok = src
        hud.compose(src, os.path.join(comp, f'{i:05d}.jpg'), meta['graphics'][i - 1])
    if missing: log(f'warning: {len(missing)} frames were not rendered (first: {missing[0]}); held the previous frame')
    out = out or os.path.join(d, f'{name}.mp4'); cmd = ['ffmpeg', '-v', 'error', '-y', '-framerate', str(meta['fps']), '-start_number', str(1 if 1 not in missing else next(i for i in range(1, n + 1) if i not in missing)), '-i', os.path.join(comp, '%05d.jpg')]
    if sound:
        wav = audio.build(os.path.join(d, 'audio.wav'), meta['total'], [tuple(c) for c in meta['cues']]); cmd += ['-i', wav, '-c:a', 'aac', '-b:a', '160k', '-shortest']
    cmd += ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]
    subprocess.run(cmd, check=True)
    if not keep_frames: shutil.rmtree(comp, ignore_errors=True)
    log(f'video: {out} ({os.path.getsize(out) / 1e6:.1f} MB, {meta["total"]:.1f}s)')
    return out


FFMPEG_HELP = 'ffmpeg -framerate {fps} -i renders/{name}/composited/%05d.jpg -i renders/{name}/audio.wav -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac -shortest renders/{name}/{name}.mp4'
