"""Cut the APPROVED AI clips of a scene into one video: script order, film finish, subtitles from the script lines, the
edit-only effects (ai_scene.EDIT_FX), and room tone. Shots without an approved clip are skipped (and listed).
    python scene_cut.py ep1_lab SCENE1 <review.json> <out.mp4> SHOT=clip.mp4 [SHOT=clip.mp4 ...]
Dialogue is subtitles until voices are decided (NOTES.md: "Seven's voice: decided later").
"""
import json, os, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFont
import ai_scene, finish

W, H, FPS = 1920, 804, 24
FONT = 'C:/Windows/Fonts/arial.ttf'
WHO = {'scientist_a': 'DR A', 'scientist_b': 'DR B', 'seven': 'SEVEN', 'voice': ''}
FX = {'B01': 'fade=t=in:st=0:d=1.2:color=black,fade=t=out:st={end_minus_1_5}:d=1.5:color=white'}


def sub_png(text, path):
    im = Image.new('RGBA', (W, 120), (0, 0, 0, 0)); d = ImageDraw.Draw(im); f = ImageFont.truetype(FONT, 40)
    w = d.textlength(text, font=f); x = (W - w) / 2
    for dx in (-2, 0, 2):
        for dy in (-2, 0, 2): d.text((x + dx, 40 + dy), text, font=f, fill=(0, 0, 0, 220))
    d.text((x, 40), text, font=f, fill=(255, 255, 255, 255)); im.save(path)


def secs(f):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f],
                                capture_output=True, text=True).stdout)


def shot(src, s, work):
    dur = secs(src); out = os.path.join(work, s['name'] + '.mp4')
    vf = finish.VF + f',fps={FPS}'
    if s['name'] in FX: vf += ',' + FX[s['name']].format(end_minus_1_5=max(dur - 1.5, 0))
    ins, ov, last = ['-i', src], '', '[v]'
    lines = s['lines']
    for i, (t, sp, ln) in enumerate(lines):
        if t >= dur: continue
        end = min(lines[i + 1][0] if i + 1 < len(lines) else dur, dur)
        png = os.path.join(work, f"{s['name']}_{i}.png"); sub_png(ln, png); ins += ['-i', png]
        ov += f"{last}[{i + 1}:v]overlay=0:{H - 140}:enable='between(t,{t},{end})'[o{i}];"; last = f'[o{i}]'
    fc = f'[0:v]{vf}[v];' + ov + f"{last}format=yuv420p[out]"
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *ins, '-filter_complex', fc, '-map', '[out]', '-c:v', 'libx264', '-crf', '18',
                    '-preset', 'medium', '-an', out], check=True)
    return out


def main():
    module, lst, review, out = sys.argv[1:5]
    clips = dict(a.split('=', 1) for a in sys.argv[5:])
    ok = json.load(open(review))
    work = tempfile.mkdtemp(); parts = []; skipped = []
    for s in ai_scene.shots(module, lst):
        v = ok.get(s['name'], {}).get('clip', {})
        if s['name'] in clips and v.get('ok'): parts.append(shot(clips[s['name']], s, work))
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
