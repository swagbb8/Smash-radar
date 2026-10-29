"""Cut the APPROVED AI clips of a scene into one video: script order, film finish, subtitles from the script lines, the
edit-only effects (ai_scene.EDIT_FX), and room tone. Shots without an approved clip are skipped (and listed).
    python scene_cut.py ep1_lab SCENE1 <review.json> <out.mp4> SHOT=clip.mp4 [SHOT=a.mp4+b.mp4 ...] [--into D01:B02]
A+B = one continuous take: B was generated from A's last frame, so they join with no cut (B's first frame dropped).
--into D01:B02 plays shot D01's beat inside B02's take: D01 is not cut in separately; its lines follow B02's.
Dialogue is subtitles until voices are decided (NOTES.md: "Seven's voice: decided later").
"""
import json, os, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFont
import ai_scene, finish

W, H, FPS = 1920, 804, 24
FONT = 'C:/Windows/Fonts/arial.ttf'
WHO = {'scientist_a': 'DR A', 'scientist_b': 'DR B', 'seven': 'SEVEN', 'voice': ''}
FX = {'B01': 'fade=t=in:st=0:d=1.2:color=black,fade=t=out:st={end_minus_1_5}:d=1.5:color=white'}
AFTER_WHITE = 'fade=t=in:st=0:d=0.8:color=white'           # the shot after a white-out comes up out of the white
SMOOTH = 'minterpolate=fps=24:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1'   # Wan makes 16 fps; a show runs at 24
SUB_Y = 105                                               # subtitles low: the picture cards sit at the bottom of the frame
PUSH = 0.05                                               # a slow 5 % push-in over each shot: no shot sits dead still


def sub_png(text, path):
    im = Image.new('RGBA', (W, 120), (0, 0, 0, 0)); d = ImageDraw.Draw(im); f = ImageFont.truetype(FONT, 34)
    w = d.textlength(text, font=f); x = (W - w) / 2
    for dx in (-2, 0, 2):
        for dy in (-2, 0, 2): d.text((x + dx, 40 + dy), text, font=f, fill=(0, 0, 0, 220))
    d.text((x, 40), text, font=f, fill=(255, 255, 255, 255)); im.save(path)


def secs(f):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f],
                                capture_output=True, text=True).stdout)


def take(srcs, work, name):
    """Several chained clips -> one file (each later clip starts on the previous one's last frame: drop that frame)."""
    if len(srcs) == 1: return srcs[0]
    out = os.path.join(work, name + '_take.mp4')
    ins = sum((['-i', x] for x in srcs), [])
    fc = ''.join(f'[{i}:v]' + ('trim=start_frame=1,setpts=PTS-STARTPTS' if i else 'null') + f'[c{i}];' for i in range(len(srcs)))
    fc += ''.join(f'[c{i}]' for i in range(len(srcs))) + f'concat=n={len(srcs)}:v=1[v]'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *ins, '-filter_complex', fc, '-map', '[v]', '-c:v', 'libx264', '-crf', '14', out], check=True)
    return out


def shot(src, s, work, after_white=False):
    dur = secs(src); out = os.path.join(work, s['name'] + '.mp4')
    grow = f"scale=w='trunc({W}*(1+{PUSH}*t/{dur:.2f})/2)*2':h=-2:eval=frame:flags=lanczos,crop={W}:{H},"   # crop w/h can't follow t
    vf = f'{SMOOTH},' + finish.VF.replace(f'scale=1920:-2:flags=lanczos,crop=1920:804,', grow) + f',fps={FPS}'
    if after_white: vf += ',' + AFTER_WHITE
    if s['name'] in FX: vf += ',' + FX[s['name']].format(end_minus_1_5=max(dur - 1.5, 0))
    ins, ov, last = ['-i', src], '', '[v]'
    lines = s['lines']
    for i, (t, sp, ln) in enumerate(lines):
        if t >= dur: continue
        end = min(lines[i + 1][0] if i + 1 < len(lines) else dur, dur)
        png = os.path.join(work, f"{s['name']}_{i}.png"); sub_png(ln, png); ins += ['-i', png]
        ov += f"{last}[{i + 1}:v]overlay=0:{H - SUB_Y}:enable='between(t,{t},{end})'[o{i}];"; last = f'[o{i}]'
    fc = f'[0:v]{vf}[v];' + ov + f"{last}format=yuv420p[out]"
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *ins, '-filter_complex', fc, '-map', '[out]', '-c:v', 'libx264', '-crf', '18',
                    '-preset', 'medium', '-an', out], check=True)
    return out


def main():
    module, lst, review, out = sys.argv[1:5]
    rest = sys.argv[5:]; into = {}
    while '--into' in rest:                                   # may be given more than once
        i = rest.index('--into'); a, b = rest[i + 1].split(':'); into[a] = b; rest = rest[:i] + rest[i + 2:]
    clips = dict(a.split('=', 1) for a in rest)
    ok = json.load(open(review))
    work = tempfile.mkdtemp(); parts = []; skipped = []
    shots = ai_scene.shots(module, lst)
    by = {x['name']: x for x in shots}
    for a, b in into.items():                                 # a's lines move into b's take, after b's first clip
        first = secs(clips[b].split('+')[0])
        by[b] = dict(by[b], lines=by[b]['lines'] + [(first + t, sp, ln) for t, sp, ln in by[a]['lines']])
    for s in [by[x['name']] for x in shots if x['name'] not in into]:
        v = ok.get(s['name'], {}).get('clip', {})
        if s['name'] in clips and v.get('ok'):
            prev = os.path.basename(parts[-1])[:-4] if parts else ''
            src = take(clips[s['name']].split('+'), work, s['name'])
            parts.append(shot(src, s, work, after_white=prev in FX and 'white' in FX[prev]))
        else: skipped.append(s['name'])
    lst_file = os.path.join(work, 'list.txt')
    open(lst_file, 'w').write(''.join(f"file '{p.replace(os.sep, '/')}'\n" for p in parts))
    total = sum(secs(p) for p in parts)
    # room tone: a low fluorescent hum + soft air noise (lab scenes); the real mix comes with the sound pass
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst_file,
                    '-f', 'lavfi', '-i', f'anoisesrc=color=brown:amplitude=0.05:d={total}',
                    '-f', 'lavfi', '-i', f'sine=frequency=120:d={total}',
                    '-filter_complex', '[1:a]lowpass=f=900[n];[2:a]volume=0.02[h];[n][h]amix=inputs=2:normalize=0,volume=1.5[a]',
                    '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest',
                    '-movflags', '+faststart', out], check=True)
    print(f'{out}: {len(parts)} shots, {total:.1f} s; not in yet: {", ".join(skipped)}')


if __name__ == '__main__':
    main()
