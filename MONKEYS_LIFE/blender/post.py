"""Editing and finishing: turns the rendered frames into the film.

    python post.py unpack <chunks dir> <frames dir>            # chunk videos from the runners -> one folder of frames per shot
    python post.py film <frames dir> <out.mp4> [--size 1280x536] [--sound track.wav] [--only s03_rise] [--label 1]

The cut list (EDL) says which piece of which shot plays when. Every frame gets the shot's slow camera move and
hand-held drift (done in 2D: the shots are filmed locked off), then the grade, a vignette and film grain.
Pieces with no rendering in them at all (black, the seconds under water, the title) are drawn here.
Pure numpy / OpenCV / PIL: no Blender.
"""
import glob, math, os, subprocess, sys
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE); FPS = 24
FONT = os.path.join(ROOT, 'assets', 'fonts', 'BebasNeue-Regular.ttf')

# what plays when: (piece, from second, to second) in that piece's own time
EDL = [
    ('black', 0.0, 1.6),
    ('s01_wake', 0.0, 6.5), ('s02_eyes', 0.0, 5.0), ('s03_rise', 0.75, 10.5), ('s04_look', 0.0, 7.5), ('s05_stand', 0.0, 5.5), ('s06_up', 0.0, 5.0),
    ('s07_jump', 0.0, 2.7), ('s08_arm', 0.0, 4.4), ('s09_fall', 0.0, 1.9), ('s10_under', 0.0, 2.4), ('s12_pull', 0.0, 3.6),
    ('s13_study', 0.0, 4.7), ('s14_device', 0.3, 2.1), ('s13_study', 6.5, 9.0), ('s15_wide', 0.0, 5.0),
    ('black', 0.0, 0.7), ('title', 0.0, 4.6), ('black', 0.0, 1.2),
]
def without_eyes():
    """The cut without the close shot of his eyes (s02): the rise then plays from its very start, where he lies still."""
    global EDL
    EDL = [e for e in EDL if e[0] != 's02_eyes']; EDL = [('s03_rise', 0.0, e[2]) if e[0] == 's03_rise' else e for e in EDL]


# the slow move laid over each shot: zoom from..to, drift (frame widths, x and y), hand-held shake (frame widths)
MOVES = {
    's01_wake': dict(zoom=(1.0, 1.0), drift=(0, 0), shake=0.0006), 's02_eyes': dict(zoom=(1.10, 1.0), drift=(0, 0), shake=0.0010), 's03_rise': dict(zoom=(1.0, 1.07), drift=(0.0, -0.010), shake=0.0016),
    's04_look': dict(zoom=(1.0, 1.0), drift=(0, 0), shake=0.0008), 's05_stand': dict(zoom=(1.05, 1.0), drift=(0.0, 0.008), shake=0.0015), 's06_up': dict(zoom=(1.0, 1.0), drift=(0, 0), shake=0.0008),
    's07_jump': dict(zoom=(1.0, 1.04), drift=(0.0, 0.005), shake=0.0022), 's08_arm': dict(zoom=(1.0, 1.08), drift=(0.0, -0.005), shake=0.0013), 's09_fall': dict(zoom=(1.04, 1.04), drift=(0, 0), shake=0.0030),
    's12_pull': dict(zoom=(1.04, 1.09), drift=(0.0, 0.010), shake=0.0024), 's13_study': dict(zoom=(1.0, 1.09), drift=(0.005, 0.006), shake=0.0011), 's14_device': dict(zoom=(1.0, 1.07), drift=(0, 0), shake=0.0009),
    's15_wide': dict(zoom=(1.14, 1.0), drift=(0.0, -0.008), shake=0.0007),
}
DUR = {'s01_wake': 6.5, 's02_eyes': 5.0, 's03_rise': 10.5, 's04_look': 7.5, 's05_stand': 5.5, 's06_up': 5.0, 's07_jump': 2.7, 's08_arm': 4.4, 's09_fall': 1.9, 's12_pull': 3.6, 's13_study': 9.0, 's14_device': 3.2, 's15_wide': 5.0}


def arg(name, default=None):
    a = sys.argv; return a[a.index(name) + 1] if name in a and a.index(name) + 1 < len(a) else default


def ease(x): x = min(1.0, max(0.0, x)); return x * x * (3 - 2 * x)
def wobble(t, seed=0.0, speed=1.0):
    t = t * speed + seed * 17.3; return (math.sin(t) + 0.6 * math.sin(t * 2.31 + 1.7 * seed + 0.5) + 0.35 * math.sin(t * 4.73 + 2.9 * seed + 1.1)) / 1.95
def curve(t, pts):
    if t <= pts[0][0]: return pts[0][1]
    if t >= pts[-1][0]: return pts[-1][1]
    i = max(j for j in range(len(pts) - 1) if pts[j][0] <= t); (t0, a), (t1, b) = pts[i], pts[i + 1]; return a + (b - a) * ease((t - t0) / (t1 - t0))


# ------------------------------------------------------------------------------------------------ frames in
class Frames:
    """The rendered frames of one shot (a folder of f0001.png ...). A missing frame is stood in for by the last one before it,
    so a shot rendered on every second or third frame still plays."""
    def __init__(self, folder):
        self.have = sorted(int(os.path.basename(p)[1:5]) for p in glob.glob(os.path.join(folder, 'f[0-9][0-9][0-9][0-9].png'))); self.folder = folder; self.cache = (None, None)

    def at(self, t):
        if not self.have: return None
        f = int(round(t * FPS)) + 1; k = max([h for h in self.have if h <= f] or [self.have[0]])
        if self.cache[0] != k:
            im = cv2.imread(os.path.join(self.folder, f'f{k:04d}.png'), cv2.IMREAD_UNCHANGED); im = im[:, :, :3][:, :, ::-1].astype(np.float32) / (65535.0 if im.dtype == np.uint16 else 255.0); self.cache = (k, im)
        return self.cache[1]


def unpack(src, dst):
    """Chunk videos (<shot>_<first>-<last>_<step>.mkv, nearly lossless) -> <dst>/<shot>/f0001.png ..."""
    n = 0
    for p in sorted(glob.glob(os.path.join(src, '*.mkv'))):
        name = os.path.basename(p)[:-4]; shot, rng, step = name.rsplit('_', 2); a, b = (int(v) for v in rng.split('-')); step = int(step); d = os.path.join(dst, shot); os.makedirs(d, exist_ok=True); tmp = os.path.join(d, '_tmp_%04d.png')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', p, '-pix_fmt', 'rgb48be', tmp], check=True)
        for i, q in enumerate(sorted(glob.glob(os.path.join(d, '_tmp_*.png')))): os.replace(q, os.path.join(d, f'f{a + i * step:04d}.png')); n += 1
    print(f'unpacked {n} frames into {dst}')


# ------------------------------------------------------------------------------------------------ picture work
def move(img, size, zoom, dx, dy, roll=0.0):
    """Reframe: scale about the centre, shift (in output pixels), roll (degrees). The source may be any size; it is fitted to the output width first."""
    W, H = size; h, w = img.shape[:2]; s = W / w * zoom; M = cv2.getRotationMatrix2D((w / 2, h / 2), roll, s); M[0, 2] += W / 2 - w / 2 + dx; M[1, 2] += H / 2 - h / 2 + dy
    return cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_CUBIC if s >= 0.999 else cv2.INTER_AREA, borderMode=cv2.BORDER_REFLECT)


_vig = {}
def vignette(size, amount=0.30):
    key = (size, amount)
    if key not in _vig:
        W, H = size; y, x = np.mgrid[0:H, 0:W].astype(np.float32); r = np.sqrt(((x - W / 2) / (W / 2)) ** 2 + ((y - H / 2) / (W / 2)) ** 2) / math.hypot(1.0, H / W); _vig[key] = (1.0 - amount * np.clip(r, 0, 1) ** 2.2)[:, :, None]
    return _vig[key]


def grade(img, warm=1.0, sat=0.94, contrast=0.20, lift=0.86):
    """The film's look: opened up a little (it is watched on a phone, not in a dark room), a little more contrast, cold in the
    shadows, warm in the lights, colour held back."""
    x = np.clip(img, 0.0, 1.0) ** lift; x = x + contrast * (x * x * (3 - 2 * x) - x); l = (x[:, :, :1] * 0.25 + x[:, :, 1:2] * 0.62 + x[:, :, 2:3] * 0.13)
    x = l + (x - l) * sat; sh = (1 - l) ** 2; hi = l ** 2
    x = x + sh * np.array([-0.006, 0.003, 0.010], np.float32) * 1.0 + hi * np.array([0.020, 0.006, -0.022], np.float32) * warm
    return np.clip(x, 0.0, 1.0)


def grain(img, seed, amount=0.020):
    rng = np.random.default_rng(seed); h, w = img.shape[:2]; n = rng.normal(0, 1, (h, w)).astype(np.float32); n = cv2.GaussianBlur(n, (0, 0), 0.55) * 1.7; c = rng.normal(0, 0.25, (h, w, 3)).astype(np.float32)
    l = np.clip(img.mean(2, keepdims=True), 0, 1); return np.clip(img + (n[:, :, None] + c) * amount * (0.35 + 0.65 * (1 - l) ** 1.5 * (l + 0.06) ** 0.25 * 1.6), 0, 1)


def lids(img, t):
    """s01: the world through eyelids coming unstuck. Dark, a slit of blur, shut again, open, clear."""
    H, W = img.shape[:2]; op = curve(t, [(0.0, 0.0), (0.7, 0.0), (1.15, 0.22), (1.45, 0.16), (1.7, 0.0), (1.95, 0.0), (2.6, 0.62), (3.0, 0.58), (3.12, 0.05), (3.3, 0.7), (4.0, 1.25), (6.5, 1.3)])
    blur = curve(t, [(0.0, 16.0), (1.2, 14.0), (2.6, 8.0), (3.3, 5.0), (4.3, 0.0)]) * W / 1280.0; gain = curve(t, [(0.0, 2.2), (1.2, 1.9), (2.6, 1.45), (4.0, 1.0)])
    if blur > 0.3: img = cv2.GaussianBlur(img, (0, 0), blur)
    img = np.clip(img * gain, 0, 1)
    if op >= 1.25: return img
    y, x = np.mgrid[0:H, 0:W].astype(np.float32); u = (x - W / 2) / (W / 2); arch = 1.0 - 0.42 * u * u; half = op * H * 0.60 * arch; d = np.abs(y - H * 0.50) - half; soft = H * (0.10 + 0.10 * op)
    m = np.clip(1.0 - d / soft, 0, 1); m = m * m * (3 - 2 * m); return img * m[:, :, None]


_bub = None
def under(size, t):
    """The seconds under the surface: green-black water, light coming down in shafts, his own air going up past him, the branch a dark bar overhead."""
    global _bub
    W, H = size; y, x = np.mgrid[0:H, 0:W].astype(np.float32); v = y / H; u = x / W
    sink = curve(t, [(0.0, 0.0), (1.3, 1.0), (2.4, 0.2)]); depth = np.clip(v * 0.9 + 0.25 * sink, 0, 1.3)
    base = np.stack([0.010 + 0.050 * np.exp(-depth * 3.2), 0.030 + 0.200 * np.exp(-depth * 2.6), 0.028 + 0.130 * np.exp(-depth * 2.9)], -1).astype(np.float32)
    rays = np.zeros((H, W), np.float32)
    for k in range(7):
        cx = 0.12 + 0.13 * k + 0.03 * math.sin(t * 0.9 + k * 1.7); slope = 0.22 + 0.05 * math.sin(k * 2.1); wdt = 0.018 + 0.012 * math.sin(k * 3.3 + t * 0.7) ** 2
        rays += np.exp(-((u - cx - slope * v) / wdt) ** 2) * (0.5 + 0.5 * math.sin(t * 2.3 + k * 2.9) ** 2) * np.exp(-depth * 2.4)
    img = base * (1.0 + 1.3 * rays[:, :, None])
    bar = np.exp(-((v - 0.10 + 0.04 * sink - 0.012 * np.sin(u * 9.0 + t * 3.0)) / 0.035) ** 2) * (1 - 0.6 * sink); img = img * (1 - 0.85 * bar[:, :, None])            # the branch, through the moving surface
    gl = np.exp(-(((u - 0.23) / 0.20) ** 2 + ((v - 0.80) / 0.30) ** 2)) * (0.55 + 0.45 * math.sin(t * 11.0) ** 2) * curve(t, [(0, 0.2), (0.5, 1.0), (2.4, 0.8)]); img = img + gl[:, :, None] * np.array([0.02, 0.10, 0.26], np.float32)   # the thing in his arm, still alight
    if _bub is None: r = np.random.default_rng(11); _bub = dict(x=r.uniform(0.05, 0.95, 170), y0=r.uniform(0.2, 1.6, 170), sp=r.uniform(0.35, 1.1, 170), rad=r.gamma(2.0, 2.2, 170) + 1.2, ph=r.uniform(0, 6.28, 170), t0=r.uniform(0.0, 1.0, 170))
    canvas = np.zeros((H, W), np.float32); k = W / 1280.0
    for i in range(170):
        tt = t - _bub['t0'][i] * 0.6
        if tt < 0: continue
        by = (_bub['y0'][i] - _bub['sp'][i] * tt * (1.0 + 0.8 * tt)) * H; bx = (_bub['x'][i] + 0.012 * math.sin(tt * 7 + _bub['ph'][i])) * W; rr = _bub['rad'][i] * k
        if -20 < by < H + 20: cv2.circle(canvas, (int(bx), int(by)), max(1, int(rr)), 0.55, max(1, int(rr * 0.35)), cv2.LINE_AA); cv2.circle(canvas, (int(bx - rr * 0.3), int(by - rr * 0.3)), max(1, int(rr * 0.25)), 1.0, -1, cv2.LINE_AA)
    canvas = cv2.GaussianBlur(canvas, (0, 0), 1.2 * k); img = img + canvas[:, :, None] * np.array([0.10, 0.22, 0.20], np.float32)
    img = cv2.GaussianBlur(img, (0, 0), 2.2 * k); fade = curve(t, [(0.0, 0.0), (0.12, 1.0), (2.2, 1.0), (2.4, 0.0)]) if False else 1.0
    return np.clip(img * fade, 0, 1)


_title = {}
def title(size, t):
    """MONKEY'S LIFE / Episode 1 / "ARISE": slammed on, held, a breath of blue behind it."""
    W, H = size
    if size not in _title:
        k = W / 1280.0; im = Image.new('L', (W, H), 0); d = ImageDraw.Draw(im); f1 = ImageFont.truetype(FONT, int(176 * k)); txt = "MONKEY'S LIFE"; sp = int(14 * k)
        widths = [d.textlength(ch, font=f1) for ch in txt]; total = sum(widths) + sp * (len(txt) - 1); x = (W - total) / 2; ytop = int(H * 0.19)
        for ch, w_ in zip(txt, widths): d.text((x, ytop), ch, font=f1, fill=255); x += w_ + sp
        sub = Image.new('L', (W, H), 0); d2 = ImageDraw.Draw(sub); f2 = ImageFont.truetype(FONT, int(40 * k)); t2 = 'EPISODE 1   ·   ARISE'; sp2 = int(10 * k); w2 = [d2.textlength(ch, font=f2) for ch in t2]; tot2 = sum(w2) + sp2 * (len(t2) - 1); x = (W - tot2) / 2; y2 = int(H * 0.72)
        for ch, w_ in zip(t2, w2): d2.text((x, y2), ch, font=f2, fill=255); x += w_ + sp2
        d2.line([(W / 2 - 150 * k, y2 - 20 * k), (W / 2 + 150 * k, y2 - 20 * k)], fill=120, width=max(1, int(2 * k)))
        a = np.asarray(im, np.float32) / 255.0; b = np.asarray(sub, np.float32) / 255.0; _title[size] = (a, b, cv2.GaussianBlur(a, (0, 0), 26 * k), cv2.GaussianBlur(b, (0, 0), 10 * k))
    a, b, glow, glow2 = _title[size]; flick = 1.0 if t > 0.5 else (0.25 + 0.75 * (int(t * 24) % 3 != 1)); puls = 0.75 + 0.25 * math.sin(t * 1.7)
    img = a[:, :, None] * np.array([0.90, 0.88, 0.82], np.float32) * flick + b[:, :, None] * np.array([0.36, 0.66, 0.90], np.float32) * ease((t - 0.9) / 0.8)
    img = img + glow[:, :, None] * np.array([0.03, 0.10, 0.22], np.float32) * puls * flick + glow2[:, :, None] * np.array([0.02, 0.08, 0.16], np.float32) * ease((t - 0.9) / 0.8)
    z = 1.0 + 0.035 * t / 4.6; return move(np.clip(img, 0, 1), size, z, 0, 0)


def placeholder(size, name, t):
    W, H = size; im = Image.new('RGB', (W, H), (10, 12, 12)); d = ImageDraw.Draw(im); f = ImageFont.truetype(FONT, int(54 * W / 1280)); d.text((W * 0.05, H * 0.4), f'{name}   {t:4.1f}s   (not rendered yet)', font=f, fill=(90, 110, 110)); return np.asarray(im, np.float32) / 255.0


# ------------------------------------------------------------------------------------------------ the film
def timeline():
    out = []; T = 0.0
    for name, a, b in EDL: out.append((name, a, b, T)); T += b - a
    return out, T


def film(frames_dir, out, size=(1280, 536), sound=None, only=None, label=False, crf=15):
    W, H = size; tl, total = timeline(); src = {}; n = int(round(total * FPS)); f1 = ImageFont.truetype(FONT, int(22 * W / 1280))
    tmp = out if not sound else out.replace('.mp4', '_silent.mp4')
    ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', str(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', tmp], stdin=subprocess.PIPE)
    wrote = 0
    for i in range(n):
        T = i / FPS; name, a, b, T0 = [e for e in tl if e[3] <= T + 1e-6][-1]; t = a + (T - T0)
        if only and name != only: continue
        if name == 'black': img = np.zeros((H, W, 3), np.float32)
        elif name == 'title': img = title(size, t)
        elif name == 's10_under': img = under(size, t)
        else:
            if name not in src: src[name] = Frames(os.path.join(frames_dir, name))
            raw = src[name].at(t)
            if raw is None: img = placeholder(size, name, t)
            else:
                m = MOVES.get(name, dict(zoom=(1, 1), drift=(0, 0), shake=0.001)); u = t / DUR.get(name, 5.0); z = m['zoom'][0] + (m['zoom'][1] - m['zoom'][0]) * u; sh = m['shake'] * W
                dx = m['drift'][0] * W * (u - 0.5) + sh * (wobble(t, 1.0, 1.9) + 0.5 * wobble(t, 2.0, 5.3)); dy = m['drift'][1] * W * (u - 0.5) + sh * (wobble(t, 3.0, 1.7) + 0.5 * wobble(t, 4.0, 4.9))
                z = max(z, 1.0 + 2.5 * m['shake'] + abs(m['drift'][0]) + abs(m['drift'][1]) * W / H) if raw.shape[1] <= W * 1.01 else z
                img = move(raw, size, z, dx, dy, roll=0.12 * wobble(t, 5.0, 1.1) * (m['shake'] / 0.0015))
                if name == 's01_wake': img = lids(img, t)
                img = grade(img)
        if name not in ('black',): img = grain(img * vignette(size, 0.30 if name != 'title' else 0.12), i, 0.020 if name != 'title' else 0.012)
        fade = min(1.0, max(0.0, (T - 1.6) / 0.01 + 1.0))                                              # the film starts on black; pieces cut hard
        im8 = np.clip(img * fade * 255.0 + np.random.default_rng(i + 7).uniform(0, 1, img.shape), 0, 255).astype(np.uint8)
        if label: im = Image.fromarray(im8); ImageDraw.Draw(im).text((8, 6), f'{name} {t:5.2f}', font=f1, fill=(255, 255, 0)); im8 = np.asarray(im)
        ff.stdin.write(im8.tobytes()); wrote += 1
    ff.stdin.close(); ff.wait()
    if sound: subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-i', sound, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out], check=True); os.remove(tmp)
    print(f'{out}: {wrote} frames, {wrote / FPS:.1f}s')


def contact(mp4, out, every=1.0, cols=6, tile=320, a=0.0, b=None):
    """Stills from a finished film laid out as a sheet, with their times: the way to look through it without a player."""
    cap = cv2.VideoCapture(mp4); n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)); fps = cap.get(cv2.CAP_PROP_FPS) or FPS; b = n / fps if b is None else b; tiles = []; t = a
    while t < b - 1e-6:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(round(t * fps))); ok, fr = cap.read()
        if not ok: break
        h = int(fr.shape[0] * tile / fr.shape[1]); fr = cv2.resize(fr, (tile, h), interpolation=cv2.INTER_AREA); cv2.putText(fr, f'{t:.1f}', (4, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 255, 255), 1, cv2.LINE_AA); tiles.append(fr); t += every
    while len(tiles) % cols: tiles.append(np.zeros_like(tiles[0]))
    cv2.imwrite(out, np.concatenate([np.concatenate(tiles[i:i + cols], 1) for i in range(0, len(tiles), cols)], 0)); print(f'{out}: {len(tiles)} stills')


if __name__ == '__main__':
    if arg('--eyes', '1') == '0': without_eyes()
    if sys.argv[1] == 'contact': contact(sys.argv[2], sys.argv[3], float(arg('--every', 1.0)), int(arg('--cols', 6)), int(arg('--tile', 320)), float(arg('--from', 0.0)), float(arg('--to')) if arg('--to') else None); sys.exit(0)
    if sys.argv[1] == 'unpack': unpack(sys.argv[2], sys.argv[3])
    elif sys.argv[1] == 'film':
        size = tuple(int(v) for v in arg('--size', '1280x536').split('x')); film(sys.argv[2], sys.argv[3], size, sound=arg('--sound'), only=arg('--only'), label=arg('--label') == '1', crf=int(arg('--crf', 15)))
