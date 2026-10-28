"""Technical QA for clips: opens, size, frames, black / white-out / frozen stretches, plus a contact sheet to look at.
    python qa.py <clip or folder> [--sheet]      -> prints PASS/FAIL per clip, writes <name>_qa.jpg next to it with --sheet
A PASS here only means the file is technically sound; every clip still gets looked at (the sheet) before it is approved.
"""
import json, os, re, subprocess, sys


def probe(f):
    r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries',
                        'stream=width,height,r_frame_rate,nb_read_frames:format=duration', '-of', 'json', f],
                       capture_output=True, text=True)
    if r.returncode: return None
    j = json.loads(r.stdout); s = j['streams'][0]
    return dict(w=s['width'], h=s['height'], fps=s['r_frame_rate'], frames=int(s.get('nb_read_frames', 0)),
                secs=float(j['format'].get('duration', 0)))


def spans(f, vf, key):
    """Seconds of the clip that a detect filter flags (black, white-out, frozen)."""
    log = subprocess.run(['ffmpeg', '-v', 'info', '-i', f, '-vf', vf, '-an', '-f', 'null', '-'], capture_output=True,
                         text=True).stderr
    return sum(float(x) for x in re.findall(key + r'[:=]\s*([\d.]+)', log))


def check(f, sheet=False):
    p = probe(f)
    if not p or p['frames'] < 2: return f, 'FAIL', ['unreadable or empty']
    probs = []
    black = spans(f, 'blackdetect=d=0.25:pix_th=0.10', 'black_duration')
    white = spans(f, 'negate,blackdetect=d=0.25:pix_th=0.10', 'black_duration')
    frozen = spans(f, 'freezedetect=n=0.003:d=1.0', 'freeze_duration')
    if black > 0.5: probs.append(f'black {black:.1f}s')
    if white > 0.5: probs.append(f'white-out {white:.1f}s')
    if frozen > 0.5 * p['secs']: probs.append(f'frozen {frozen:.1f}s of {p["secs"]:.1f}s')
    if sheet:
        n = max(p['frames'] // 6, 1)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', f, '-vf', f"select='not(mod(n\\,{n}))',scale=480:-1,tile=3x2",
                        '-frames:v', '1', os.path.splitext(f)[0] + '_qa.jpg'])
    info = f"{p['w']}x{p['h']} {p['fps']} {p['frames']}f {p['secs']:.1f}s"
    return f, 'FAIL' if probs else 'PASS', [info] + probs


def main():
    src = sys.argv[1]
    files = [os.path.join(src, x) for x in sorted(os.listdir(src)) if x.endswith('.mp4')] if os.path.isdir(src) else [src]
    bad = 0
    for f in files:
        name, status, notes = check(f, '--sheet' in sys.argv)
        bad += status == 'FAIL'; print(f'{status}  {os.path.basename(name)}  ' + ' | '.join(notes), flush=True)
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
