"""Cut Episode 1 together from the AI clips: trims each clip to its length, burns in the subtitles (the troop's grunts),
Seven's English words and the on-screen captions, adds the title cards and the credits, and joins it all into one film.

    python cut.py <clips dir> <out.mp4> [--scene 0|all] [--size 1920x1080] [--crf 20] [--work DIR]

<clips dir> holds NNN.mp4 per clip number (several dirs: join them with commas). A clip that is not there yet shows
as a dark card with its number and what it should be, so a half-made scene can still be watched.
"""
import json, os, shutil, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from PIL import Image, ImageDraw, ImageFont                                                # noqa: E402
from build import episode                                                                 # noqa: E402

FPS = 24
BEBAS = os.path.join(HERE, '..', 'assets', 'fonts', 'BebasNeue-Regular.ttf')
_find = lambda *names: next((p for p in names if os.path.exists(p)), names[-1])
SUB_FONT = _find('/usr/share/fonts/opentype/inter/Inter-SemiBoldItalic.otf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf')
WORD_FONT = _find('/usr/share/fonts/opentype/inter/InterDisplay-SemiBold.otf', '/usr/share/fonts/opentype/inter/Inter-Bold.otf',
                  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')
CAP_FONT = _find('/usr/share/fonts/opentype/inter/InterDisplay-Medium.otf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
CREDITS = ["MONKEY'S LIFE", '', 'EPISODE 1  ·  ARISE', '', '', 'CREATED BY', 'ASH', '', '', 'SEVEN · GRUB · PETCH · DOLO', '',
           '', 'PICTURES', 'MiniMax H3 Max  ·  Kling 3.0', 'cast photos by Nano Banana Pro', '', 'SOUND', 'MMAudio', '',
           'CUT TOGETHER BY', 'Claude', '', '', 'HE REMEMBERS THE FUTURE.']


def arg(name, default=None):
    a = sys.argv; return a[a.index(name) + 1] if name in a and a.index(name) + 1 < len(a) else default


def run(*a):
    p = subprocess.run(list(a), capture_output=True, text=True)
    if p.returncode: raise RuntimeError(' '.join(a[:6]) + ' ...\n' + p.stderr[-1500:])
    return p


def has_audio(path):
    p = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', path],
                       capture_output=True, text=True)
    return bool(p.stdout.strip())


def spaced(d, xy, text, font, fill, spacing, anchor_center=True, W=None):
    widths = [d.textlength(ch, font=font) for ch in text]; total = sum(widths) + spacing * (len(text) - 1)
    x = (W - total) / 2 if anchor_center else xy[0]
    for ch, w in zip(text, widths): d.text((x, xy[1]), ch, font=font, fill=fill); x += w + spacing


def card(path, size, top, bottom, line=True):
    """Title cards in the look of the 3D cut: big letter-spaced MONKEY'S LIFE, a small line in the device's blue."""
    W, H = size; k = W / 1280; im = Image.new('RGB', (W, H), (0, 0, 0)); d = ImageDraw.Draw(im)
    spaced(d, (0, int(H * 0.30)), top, ImageFont.truetype(BEBAS, int(150 * k)), (230, 225, 210), int(12 * k), W=W)
    y2 = int(H * 0.62)
    if line: d.line([(W / 2 - 150 * k, y2 - 22 * k), (W / 2 + 150 * k, y2 - 22 * k)], fill=(70, 110, 140), width=max(1, int(2 * k)))
    spaced(d, (0, y2), bottom, ImageFont.truetype(BEBAS, int(40 * k)), (92, 168, 230), int(9 * k), W=W)
    im.save(path)


def slate(path, size, n, what):
    """Stand-in for a clip that is not made yet."""
    W, H = size; k = W / 1280; im = Image.new('RGB', (W, H), (12, 16, 15)); d = ImageDraw.Draw(im)
    d.text((W * 0.07, H * 0.36), f'#{n:03d}', font=ImageFont.truetype(BEBAS, int(90 * k)), fill=(99, 185, 255))
    d.text((W * 0.07, H * 0.52), what, font=ImageFont.truetype(CAP_FONT, int(30 * k)), fill=(200, 210, 205))
    d.text((W * 0.07, H * 0.60), 'clip not made yet', font=ImageFont.truetype(CAP_FONT, int(22 * k)), fill=(120, 140, 130))
    im.save(path)


def credits_png(path, size):
    W, H = size; k = W / 1280; line_h = int(54 * k); tall = H + len(CREDITS) * line_h + H
    im = Image.new('RGB', (W, tall), (0, 0, 0)); d = ImageDraw.Draw(im); y = H
    for t in CREDITS:
        big = t.isupper() and len(t) < 30
        f = ImageFont.truetype(BEBAS if big else CAP_FONT, int((44 if t == "MONKEY'S LIFE" else 30 if big else 26) * k))
        col = (92, 168, 230) if t in ('CREATED BY', 'PICTURES', 'SOUND', 'CUT TOGETHER BY') else (225, 222, 212)
        if t: d.text(((W - d.textlength(t, font=f)) / 2, y), t, font=f, fill=col)
        y += line_h
    im.save(path); return tall


def times(lines, sec):
    """Spread a shot's lines over it, longer lines getting longer."""
    a, b = 0.35, max(0.6, sec - 0.25); weight = [len(t) + 14 for _, t in lines]; total = sum(weight); out = []; t = a
    for (who, text), w in zip(lines, weight):
        d = (b - a) * w / total; out.append((who, text, t, t + d - 0.08)); t += d
    return out


def text_filters(lines, sec, size, work, tag):
    W, H = size; k = H / 1080; out = []
    for i, (who, text, a, b) in enumerate(times(lines, sec)):
        tf = os.path.join(work, f'{tag}_t{i}.txt'); open(tf, 'w').write(text)
        alpha = f"if(lt(t\\,{a:.2f})\\,0\\,if(lt(t\\,{a + 0.2:.2f})\\,(t-{a:.2f})/0.2\\,if(lt(t\\,{b - 0.2:.2f})\\,1\\,if(lt(t\\,{b:.2f})\\,({b:.2f}-t)/0.2\\,0))))"
        if who == 'SEVEN': font, fs, y, bw = WORD_FONT, int(66 * k), f'h*0.70', int(4 * k)
        elif who == 'CAP': font, fs, y, bw = CAP_FONT, int(44 * k), f'h*0.80', int(3 * k)
        else: font, fs, y, bw = SUB_FONT, int(46 * k), f'h-{int(150 * k)}', int(3 * k)
        out.append(f"drawtext=fontfile='{font}':textfile='{tf}':expansion=none:fontsize={fs}:fontcolor=white:borderw={bw}:"
                   f"bordercolor=black@0.85:shadowx=0:shadowy={int(2 * k)}:shadowcolor=black@0.6:x=(w-text_w)/2:y={y}:"
                   f"alpha='{alpha}'")
    return out


def segment(shot, path, size, crf, work, clipdirs):
    W, H = size; sec = shot['sec']; enc = ['-c:v', 'libx264', '-preset', 'medium', '-crf', str(crf), '-pix_fmt', 'yuv420p', '-r', str(FPS),
                                           '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', '-t', f'{sec:.3f}', '-movflags', '+faststart', path]
    silent = ['-f', 'lavfi', '-t', f'{sec:.3f}', '-i', 'anullsrc=r=48000:cl=stereo']
    if shot['kind'] == 'mine':
        what = shot['what']
        if what.startswith('Title') and 'ARISE' in what: img = os.path.join(work, 'title.png'); card(img, size, "MONKEY'S LIFE", 'EPISODE 1   ·   ARISE')
        elif what.startswith('Title'): img = os.path.join(work, 'end.png'); card(img, size, "MONKEY'S LIFE", 'HE REMEMBERS THE FUTURE.')
        elif 'credits' in what.lower():
            img = os.path.join(work, 'credits.png'); tall = credits_png(img, size); speed = (tall - H) / sec
            run('ffmpeg', '-v', 'error', '-y', '-loop', '1', '-framerate', str(FPS), '-i', img, *silent,
                '-filter_complex', f"[0:v]crop={W}:{H}:0:'min({tall - H}\\,t*{speed:.3f})',format=yuv420p[v]", '-map', '[v]', '-map', '1:a', *enc)
            return
        else: img = None
        if img:
            fade = f"fade=t=in:st=0:d=0.6,fade=t=out:st={max(0, sec - 0.8):.2f}:d=0.8,format=yuv420p"
            run('ffmpeg', '-v', 'error', '-y', '-loop', '1', '-framerate', str(FPS), '-i', img, *silent, '-vf', fade, '-map', '0:v', '-map', '1:a', *enc)
        else:
            run('ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', f'color=c=black:s={W}x{H}:r={FPS}', *silent, '-map', '0:v', '-map', '1:a', *enc)
        return
    n = shot['n']; clip = next((os.path.join(d, f'{n:03d}.mp4') for d in clipdirs if os.path.exists(os.path.join(d, f'{n:03d}.mp4'))), None)
    texts = text_filters(shot['lines'], sec, size, work, f'{n:03d}')
    look = [f'scale={W}:{H}:force_original_aspect_ratio=increase', f'crop={W}:{H}', f'fps={FPS}', 'setsar=1']
    if shot['kind'] == 'flash': look.append('fade=t=in:st=0:d=0.12:color=white')
    if clip:
        vf = ','.join(look + texts + ['format=yuv420p'])
        if has_audio(clip):
            run('ffmpeg', '-v', 'error', '-y', '-ss', '0.15', '-i', clip, '-vf', vf, '-af', f'apad,atrim=0:{sec:.3f}', '-map', '0:v', '-map', '0:a', *enc)
        else:
            run('ffmpeg', '-v', 'error', '-y', '-ss', '0.15', '-i', clip, *silent, '-vf', vf, '-map', '0:v', '-map', '1:a', *enc)
    else:
        img = os.path.join(work, f'{n:03d}_slate.png'); slate(img, size, n, shot['what'])
        vf = ','.join(texts + ['format=yuv420p'])
        run('ffmpeg', '-v', 'error', '-y', '-loop', '1', '-framerate', str(FPS), '-i', img, *silent, '-vf', vf, '-map', '0:v', '-map', '1:a', *enc)


def main():
    src, out = sys.argv[1], sys.argv[2]; clipdirs = [os.path.abspath(d) for d in src.split(',')]
    scene = arg('--scene', 'all'); W, H = (int(v) for v in arg('--size', '1920x1080').split('x')); crf = int(arg('--crf', 20))
    work = os.path.abspath(arg('--work', out + '_work')); shutil.rmtree(work, ignore_errors=True); os.makedirs(work)
    scenes, total, nclips = episode()
    pick = [sc for sc in scenes if scene == 'all' or sc['k'] == int(scene)]
    segs = []; have = 0; need = 0
    for sc in pick:
        for i, shot in enumerate(sc['shots']):
            path = os.path.join(work, f"seg_{sc['k']:02d}_{i:03d}.mp4"); segment(shot, path, (W, H), crf, work, clipdirs); segs.append(path)
            if shot['kind'] != 'mine':
                need += 1; have += any(os.path.exists(os.path.join(d, f"{shot['n']:03d}.mp4")) for d in clipdirs)
        print(f"cut {sc['title']} ({sc['length']})", flush=True)
    lst = os.path.join(work, 'list.txt'); open(lst, 'w').write(''.join(f"file '{p}'\n" for p in segs))
    run('ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', '-movflags', '+faststart', out)
    print(f'{out}: {have}/{need} clips in, {os.path.getsize(out) / 1e6:.1f} MB')


if __name__ == '__main__': main()
